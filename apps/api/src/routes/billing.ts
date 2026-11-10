import type { FastifyInstance } from "fastify";
import { EntitlementStatus, PaymentStatus, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { HttpError } from "../errors.js";
import type { AppConfig } from "../config.js";
import { getActiveEventEntitlement, getEventGuestLimit, hasPlanFeature, isEntitlementActive } from "../billing/entitlements.js";
import { requireUser } from "../auth.js";
import { parseUuid, requireOwnedEvent } from "./helpers.js";

function isStripeSignatureError(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeSignatureVerificationError;
}

function paymentIntentId(paymentIntent: string | Stripe.PaymentIntent | null): string | null {
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
}

async function applyWebhookEvent(
  transaction: Prisma.TransactionClient,
  event: Stripe.Event,
  logger: FastifyInstance["log"]
): Promise<void> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (session.object !== "checkout.session" || session.payment_status !== "paid") {
      return;
    }

    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      logger.error({ stripeEventId: event.id, checkoutSessionId: session.id }, "Paid checkout session is missing payment metadata");
      return;
    }
    const payment = await transaction.payment.findUnique({
      where: { id: paymentId },
      include: { event: { select: { ownerId: true } }, plan: true }
    });
    const intentId = paymentIntentId(session.payment_intent);
    if (
      !payment ||
      payment.status === PaymentStatus.REFUNDED ||
      session.mode !== "payment" ||
      payment.stripeCheckoutSessionId !== session.id ||
      payment.event.ownerId !== payment.userId ||
      payment.planId !== session.metadata?.planId ||
      payment.eventId !== session.metadata?.eventId ||
      payment.userId !== session.metadata?.userId ||
      payment.amountCents !== session.amount_total ||
      payment.currency.toLowerCase() !== session.currency?.toLowerCase()
    ) {
      logger.error(
        { stripeEventId: event.id, checkoutSessionId: session.id, paymentId },
        "Stripe checkout session did not match its pending payment"
      );
      return;
    }

    await transaction.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: intentId,
        paidAt: new Date(event.created * 1000)
      }
    });
    const existingEntitlement = await transaction.eventEntitlement.findUnique({
      where: { eventId: payment.eventId }
    });
    if (
      existingEntitlement &&
      isEntitlementActive(existingEntitlement) &&
      existingEntitlement.paymentId &&
      existingEntitlement.paymentId !== payment.id
    ) {
      logger.error(
        { stripeEventId: event.id, eventId: payment.eventId, paymentId: payment.id },
        "Event already has an entitlement from a different payment"
      );
      return;
    }
    await transaction.eventEntitlement.upsert({
      where: { eventId: payment.eventId },
      create: {
        eventId: payment.eventId,
        planId: payment.planId,
        paymentId: payment.id,
        status: EntitlementStatus.ACTIVE
      },
      update: {
        planId: payment.planId,
        paymentId: payment.id,
        status: EntitlementStatus.ACTIVE,
        grantedAt: new Date(event.created * 1000),
        expiresAt: null
      }
    });
    return;
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    if (session.object !== "checkout.session") {
      return;
    }
    await transaction.payment.updateMany({
      where: {
        stripeCheckoutSessionId: session.id,
        status: PaymentStatus.PENDING
      },
      data: { status: PaymentStatus.FAILED }
    });
    return;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (charge.object !== "charge" || !charge.payment_intent) {
      return;
    }
    if (charge.amount_refunded < charge.amount) {
      logger.info({ stripeEventId: event.id, chargeId: charge.id }, "Partial refund does not revoke the event upgrade");
      return;
    }
    const intentId = paymentIntentId(charge.payment_intent);
    if (!intentId) {
      return;
    }
    const payment = await transaction.payment.findUnique({
      where: { stripePaymentIntentId: intentId },
      select: { id: true }
    });
    if (!payment) {
      logger.warn({ stripeEventId: event.id, paymentIntentId: intentId }, "Refund received for an unknown InviteHub payment");
      return;
    }
    await transaction.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED }
    });
    await transaction.eventEntitlement.updateMany({
      where: { paymentId: payment.id, status: EntitlementStatus.ACTIVE },
      data: { status: EntitlementStatus.REVOKED }
    });
  }
}

export async function registerBillingRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/v1/billing/plans", async () => {
    const plans = await app.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: "asc" },
      select: {
        key: true,
        name: true,
        priceCents: true,
        currency: true,
        guestLimit: true,
        activeEventLimit: true,
        maxDesignGenerations: true,
        features: true
      }
    });
    return {
      plans,
      checkoutEnabled: Boolean(app.stripe && config.STRIPE_WEBHOOK_SECRET)
    };
  });

  app.get<{ Params: { eventId: string } }>(
    "/api/v1/events/:eventId/entitlement",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const eventId = parseUuid(request.params.eventId, "eventId");
      const [entitlement, guestLimit, guestCount, latestPayment] = await Promise.all([
        getActiveEventEntitlement(app.prisma, eventId),
        getEventGuestLimit(app.prisma, eventId),
        app.prisma.guest.count({ where: { eventId } }),
        app.prisma.payment.findFirst({
          where: { eventId },
          orderBy: { createdAt: "desc" },
          select: { status: true, createdAt: true }
        })
      ]);
      return {
        entitlement: entitlement
          ? {
              plan: {
                key: entitlement.plan.key,
                name: entitlement.plan.name,
                maxDesignGenerations: entitlement.plan.maxDesignGenerations,
                features: entitlement.plan.features
              },
              status: entitlement.status,
              expiresAt: entitlement.expiresAt
            }
          : null,
        guestLimit,
        guestCount,
        latestPayment
      };
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/api/v1/events/:eventId/checkout",
    async (request) => {
      const event = await requireOwnedEvent(app, request, request.params.eventId);
      const stripe = app.stripe;
      if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
        throw new HttpError(503, "Event upgrades are not available right now", "BILLING_UNAVAILABLE");
      }
      const eventId = parseUuid(request.params.eventId, "eventId");

      const purchase = await app.prisma.$transaction(async (transaction) => {
        const [currentEvent, plan] = await Promise.all([
          transaction.event.findFirst({
            where: { id: eventId, ownerId: event.ownerId },
            include: { entitlement: true }
          }),
          transaction.plan.findUnique({ where: { key: "custom_design" } })
        ]);
        if (!currentEvent) {
          throw new HttpError(404, "Event not found", "EVENT_NOT_FOUND");
        }
        if (isEntitlementActive(currentEvent.entitlement)) {
          throw new HttpError(409, "This event already has an active upgrade", "ENTITLEMENT_ALREADY_ACTIVE");
        }
        if (
          !plan?.isActive ||
          plan.priceCents <= 0 ||
          plan.priceCents > 99_999_999 ||
          !/^[a-z]{3}$/i.test(plan.currency) ||
          !hasPlanFeature(plan.features, "customDesign")
        ) {
          throw new HttpError(503, "Custom Design plan configuration is unavailable", "PLAN_CONFIGURATION_MISSING");
        }

        const existingPayment = await transaction.payment.findFirst({
          where: { eventId, userId: event.ownerId, status: PaymentStatus.PENDING },
          orderBy: { createdAt: "desc" }
        });
        if (existingPayment?.stripeCheckoutUrl) {
          return { payment: existingPayment, plan, checkoutUrl: existingPayment.stripeCheckoutUrl };
        }
        if (existingPayment) {
          if (existingPayment.createdAt.getTime() > Date.now() - 5 * 60 * 1000) {
            throw new HttpError(409, "Checkout is being prepared. Please try again shortly.", "CHECKOUT_PENDING");
          }
          await transaction.payment.update({
            where: { id: existingPayment.id },
            data: { status: PaymentStatus.FAILED }
          });
        }
        const payment = await transaction.payment.create({
          data: {
            userId: event.ownerId,
            eventId,
            planId: plan.id,
            amountCents: plan.priceCents,
            currency: plan.currency.toLowerCase()
          }
        });
        return { payment, plan, checkoutUrl: null };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw new HttpError(409, "Checkout is already being prepared. Please try again.", "CHECKOUT_CONFLICT");
        }
        throw error;
      });

      if (purchase.checkoutUrl) {
        return { checkoutUrl: purchase.checkoutUrl };
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          client_reference_id: purchase.payment.id,
          customer_email: (await app.prisma.user.findUnique({
            where: { id: event.ownerId },
            select: { email: true }
          }))?.email,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: purchase.plan.currency.toLowerCase(),
              unit_amount: purchase.plan.priceCents,
              product_data: { name: purchase.plan.name }
            }
          }],
          metadata: {
            paymentId: purchase.payment.id,
            eventId,
            planId: purchase.plan.id,
            userId: event.ownerId
          },
          payment_intent_data: {
            metadata: {
              paymentId: purchase.payment.id,
              eventId,
              planId: purchase.plan.id,
              userId: event.ownerId
            }
          },
          success_url: new URL(`/events/${eventId}?checkout=success`, config.WEB_ORIGIN).toString(),
          cancel_url: new URL(`/events/${eventId}?checkout=cancelled`, config.WEB_ORIGIN).toString()
        }, { idempotencyKey: `invitehub-checkout-${purchase.payment.id}` });
        if (!session.url) {
          throw new Error("Stripe did not return a Checkout URL");
        }
        await app.prisma.payment.update({
          where: { id: purchase.payment.id },
          data: {
            stripeCheckoutSessionId: session.id,
            stripeCheckoutUrl: session.url
          }
        });
        return { checkoutUrl: session.url };
      } catch (error) {
        request.log.error({ err: error, paymentId: purchase.payment.id }, "Stripe Checkout session creation failed");
        await app.prisma.payment.updateMany({
          where: { id: purchase.payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED }
        });
        throw new HttpError(502, "Checkout could not be started. Please try again.", "CHECKOUT_SESSION_FAILED");
      }
    }
  );

  app.post("/api/v1/billing/webhook", {
    config: { rawBody: true, rateLimit: { max: 300, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const stripe = app.stripe;
    const signature = request.headers["stripe-signature"];
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      throw new HttpError(503, "Stripe webhook is not configured", "BILLING_UNAVAILABLE");
    }
    if (typeof signature !== "string" || !request.rawBody) {
      throw new HttpError(400, "Stripe signature or request body is missing", "WEBHOOK_SIGNATURE_MISSING");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        config.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      if (isStripeSignatureError(error)) {
        throw new HttpError(400, "Stripe signature verification failed", "WEBHOOK_SIGNATURE_INVALID");
      }
      throw error;
    }

    try {
      await app.prisma.$transaction(async (transaction) => {
        await transaction.stripeWebhookEvent.create({
          data: { id: event.id, type: event.type }
        });
        await applyWebhookEvent(transaction, event, request.log);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const processed = await app.prisma.stripeWebhookEvent.findUnique({
          where: { id: event.id },
          select: { id: true }
        });
        if (processed) {
          return reply.code(200).send({ received: true, duplicate: true });
        }
      }
      throw error;
    }

    return reply.code(200).send({ received: true });
  });
}
