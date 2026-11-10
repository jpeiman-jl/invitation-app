<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
import { apiErrorMessage } from "~/utils/api-error";

interface EventDetails {
  id: string;
  title: string;
  hostNames: string[];
  startsAt: string;
  timeZone: string;
  venue: string | null;
  address: string | null;
  description: string | null;
  dressCode: string | null;
  rsvpDeadline: string | null;
  templateKey: string;
  _count: { guests: number; tables: number };
}

interface GuestResponse {
  id: string;
  name: string;
  rsvp: { status: "ATTENDING" | "DECLINED" | "MAYBE"; partySize: number } | null;
}

interface BillingPlan {
  key: string;
  name: string;
  priceCents: number;
  currency: string;
  guestLimit: number;
  maxDesignGenerations: number;
  features: Record<string, unknown>;
}

interface EventBilling {
  entitlement: {
    plan: { key: string; name: string; maxDesignGenerations: number; features: Record<string, unknown> };
    status: string;
    expiresAt: string | null;
  } | null;
  guestLimit: number;
  guestCount: number;
  latestPayment: { status: string; createdAt: string } | null;
}

const route = useRoute();
const eventId = computed(() => String(route.params.eventId));
const auth = useAuthStore();
const { $api } = useNuxtApp();
const event = ref<EventDetails | null>(null);
const guests = ref<GuestResponse[]>([]);
const seatsAssigned = ref(0);
const guestsUnassigned = ref(0);
const customDesignPlan = ref<BillingPlan | null>(null);
const checkoutEnabled = ref(false);
const eventBilling = ref<EventBilling | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const billingError = ref("");
const billingLoading = ref(false);
const checkoutStarting = ref(false);
const deleting = ref(false);
const checkoutResult = computed(() => route.query.checkout);

useHead({ title: computed(() => event.value ? `${event.value.title} overview` : "Event overview") });

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    const [eventResult, guestResult, seatingResult] = await Promise.all([
      $api<{ event: EventDetails }>(`/api/v1/events/${eventId.value}`),
      $api<{ guests: GuestResponse[] }>(`/api/v1/events/${eventId.value}/guests`),
      $api<{
        tables: Array<{ assignments: unknown[] }>;
        unassignedGuests: Array<{ id: string }>;
      }>(`/api/v1/events/${eventId.value}/seating`)
    ]);
    event.value = eventResult.event;
    guests.value = guestResult.guests;
    seatsAssigned.value = seatingResult.tables.reduce((sum, table) => sum + table.assignments.length, 0);
    guestsUnassigned.value = seatingResult.unassignedGuests.length;
    await loadBilling();
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "This event couldn't be loaded. Please try again.");
  } finally {
    loading.value = false;
  }
});

async function loadBilling(): Promise<void> {
  billingLoading.value = true;
  billingError.value = "";
  try {
    const [plansResult, billingResult] = await Promise.all([
      $api<{ plans: BillingPlan[]; checkoutEnabled: boolean }>("/api/v1/billing/plans"),
      $api<EventBilling>(`/api/v1/events/${eventId.value}/entitlement`)
    ]);
    customDesignPlan.value = plansResult.plans.find((plan) => plan.features.customDesign === true) ?? null;
    checkoutEnabled.value = plansResult.checkoutEnabled;
    eventBilling.value = billingResult;
  } catch (error) {
    billingError.value = apiErrorMessage(error, "Upgrade information couldn't be loaded.");
  } finally {
    billingLoading.value = false;
  }
}

function formatPrice(plan: BillingPlan): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.currency.toUpperCase()
  }).format(plan.priceCents / 100);
}

async function beginCheckout(): Promise<void> {
  checkoutStarting.value = true;
  billingError.value = "";
  try {
    const result = await $api<{ checkoutUrl: string }>(
      `/api/v1/events/${eventId.value}/checkout`,
      { method: "POST" }
    );
    window.location.assign(result.checkoutUrl);
  } catch (error) {
    billingError.value = apiErrorMessage(error, "Checkout couldn't be started.");
    checkoutStarting.value = false;
  }
}

const responded = computed(() => guests.value.filter((guest) => guest.rsvp !== null).length);
const attending = computed(() => guests.value.filter((guest) => guest.rsvp?.status === "ATTENDING").length);
const declined = computed(() => guests.value.filter((guest) => guest.rsvp?.status === "DECLINED").length);
const pending = computed(() => guests.value.filter((guest) => guest.rsvp === null).length);
const headcount = computed(() => guests.value.reduce((sum, guest) =>
  sum + (guest.rsvp?.status === "ATTENDING" ? guest.rsvp.partySize : 0), 0));

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(value));
}

async function deleteEvent(): Promise<void> {
  if (!event.value || !window.confirm(`Delete "${event.value.title}" and its guest list? This can't be undone.`)) {
    return;
  }
  deleting.value = true;
  errorMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}`, { method: "DELETE" });
    await navigateTo("/dashboard");
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "The event couldn't be deleted.");
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink to="/dashboard" class="text-sm font-medium text-moss hover:underline">← All events</NuxtLink>
    <p v-if="loading" class="mt-8 text-sm text-ink/60" role="status">Loading event overview…</p>
    <p v-else-if="errorMessage && !event" class="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
    <template v-else-if="event">
      <div class="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-sm font-semibold text-moss">Event overview</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{{ event.title }}</h1>
          <p class="mt-2 text-ink/60">{{ formatDate(event.startsAt, event.timeZone) }}</p>
          <p v-if="event.venue" class="mt-1 text-sm text-ink/60">{{ event.venue }}<span v-if="event.address"> · {{ event.address }}</span></p>
        </div>
        <div class="flex flex-wrap gap-3">
          <NuxtLink :to="`/events/${event.id}/guests`" class="inline-flex min-h-11 items-center rounded-full bg-moss px-5 text-sm font-semibold text-white hover:bg-moss-dark">
            Manage guests
          </NuxtLink>
          <NuxtLink :to="`/events/${event.id}/seating`" class="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-medium hover:bg-paper">
            Seating chart
          </NuxtLink>
          <NuxtLink :to="`/events/${event.id}/invitation`" class="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-medium hover:bg-paper">
            Invitation & program
          </NuxtLink>
          <NuxtLink :to="`/events/${event.id}/edit`" class="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-medium hover:bg-paper">
            Edit event
          </NuxtLink>
          <button type="button" class="inline-flex min-h-11 items-center rounded-full border border-red-200 bg-white px-5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60" :disabled="deleting" @click="deleteEvent">
            {{ deleting ? "Deleting…" : "Delete" }}
          </button>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
      <p v-if="checkoutResult === 'success'" class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900" role="status">
        Checkout completed. Your upgrade will appear after Stripe confirms payment.
      </p>
      <p v-else-if="checkoutResult === 'cancelled'" class="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950" role="status">
        Checkout was cancelled. No payment was made.
      </p>
      <div class="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Invited</p><p class="mt-2 text-3xl font-semibold">{{ guests.length }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Responded</p><p class="mt-2 text-3xl font-semibold">{{ responded }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Attending</p><p class="mt-2 text-3xl font-semibold">{{ attending }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Declined</p><p class="mt-2 text-3xl font-semibold">{{ declined }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Pending</p><p class="mt-2 text-3xl font-semibold">{{ pending }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Seats assigned</p>
          <p class="mt-2 text-3xl font-semibold">{{ seatsAssigned }}</p>
          <p class="mt-1 text-xs text-ink/55">{{ guestsUnassigned }} guests still need seats</p>
        </article>
      </div>

      <div class="mt-6 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <section class="rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="response-heading">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-moss">Guest responses</p>
              <h2 id="response-heading" class="mt-1 text-xl font-semibold">A quick pulse</h2>
            </div>
            <NuxtLink :to="`/events/${event.id}/guests`" class="text-sm font-semibold text-moss hover:underline">See guest list</NuxtLink>
          </div>
          <div class="mt-6 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span class="text-5xl font-semibold tracking-tight">{{ headcount }}</span>
            <span class="pb-1 text-sm text-ink/60">people currently expected</span>
          </div>
          <div class="mt-5 h-2 overflow-hidden rounded-full bg-paper" role="img" :aria-label="`${responded} of ${guests.length} guests have responded`">
            <div class="h-full rounded-full bg-moss transition-all" :style="{ width: `${guests.length ? Math.min(100, responded / guests.length * 100) : 0}%` }" />
          </div>
          <p class="mt-3 text-xs text-ink/55">{{ responded }} of {{ guests.length }} guests have responded</p>
          <div class="mt-7 divide-y divide-line">
            <div v-for="guest in guests.slice(0, 5)" :key="guest.id" class="flex items-center justify-between gap-4 py-3">
              <span class="truncate text-sm font-medium">{{ guest.name }}</span>
              <span class="shrink-0 rounded-full px-3 py-1 text-xs font-medium" :class="{
                'bg-green-50 text-green-800': guest.rsvp?.status === 'ATTENDING',
                'bg-red-50 text-red-800': guest.rsvp?.status === 'DECLINED',
                'bg-amber-50 text-amber-800': guest.rsvp?.status === 'MAYBE',
                'bg-paper text-ink/55': !guest.rsvp
              }">{{ guest.rsvp?.status?.toLowerCase() ?? "pending" }}</span>
            </div>
            <p v-if="!guests.length" class="py-5 text-sm text-ink/55">Add guests to start collecting responses.</p>
          </div>
        </section>
        <aside class="rounded-3xl border border-line bg-[#edf2ed] p-6 sm:p-8">
          <p class="text-sm font-semibold text-moss">Up next</p>
          <h2 class="mt-2 text-xl font-semibold">Make your guest list</h2>
          <p class="mt-2 text-sm leading-6 text-ink/65">Add people one at a time or import a CSV. Every guest gets a private link—even without an email address.</p>
          <NuxtLink :to="`/events/${event.id}/guests`" class="mt-5 inline-flex min-h-11 items-center rounded-full bg-moss px-5 text-sm font-semibold text-white hover:bg-moss-dark">
            Open guest list
          </NuxtLink>
          <div class="mt-8 border-t border-moss/15 pt-5">
            <p class="text-sm font-semibold">Ready to plan the room?</p>
            <p class="mt-1 text-xs leading-5 text-ink/60">Arrange guests at tables before or after RSVPs, keep households together, and publish seats to guest invitations.</p>
            <NuxtLink :to="`/events/${event.id}/seating`" class="mt-4 inline-flex min-h-10 items-center rounded-full border border-moss/25 bg-white px-4 text-sm font-semibold text-moss hover:bg-paper">
              Open seating chart
            </NuxtLink>
          </div>
        </aside>
      </div>
      <section class="mt-6 rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="upgrade-heading">
        <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-semibold text-moss">Event upgrade</p>
            <h2 id="upgrade-heading" class="mt-1 text-xl font-semibold">
              {{ eventBilling?.entitlement?.plan.name ?? "Custom invitation design" }}
            </h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
              {{ eventBilling?.entitlement
                ? `This event has an active ${eventBilling.entitlement.plan.name} upgrade. Your guest limit is ${eventBilling.guestLimit.toLocaleString()}.`
                : customDesignPlan && checkoutEnabled
                  ? `Unlock Custom Design for this event and raise the guest limit to ${customDesignPlan.guestLimit.toLocaleString()}. One-time payment of ${formatPrice(customDesignPlan)}.`
                  : customDesignPlan
                    ? `Custom Design is ${formatPrice(customDesignPlan)} for this event, but secure checkout is not configured in this environment.`
                  : billingLoading
                    ? "Loading available plans…"
                    : "Upgrade options are not available right now." }}
            </p>
            <p v-if="eventBilling && !eventBilling.entitlement" class="mt-1 text-xs text-ink/55">
              {{ eventBilling.guestCount }} / {{ eventBilling.guestLimit }} guests used on the current plan.
            </p>
            <p v-if="billingError" class="mt-3 text-sm text-red-800" role="alert">{{ billingError }}</p>
          </div>
          <button
            v-if="!eventBilling?.entitlement && customDesignPlan && checkoutEnabled"
            type="button"
            class="min-h-12 shrink-0 rounded-full bg-moss px-6 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60"
            :disabled="checkoutStarting || billingLoading"
            @click="beginCheckout"
          >
            {{ checkoutStarting ? "Opening secure checkout…" : `Upgrade · ${formatPrice(customDesignPlan)}` }}
          </button>
          <button
            v-else-if="billingError"
            type="button"
            class="min-h-11 shrink-0 rounded-full border border-line px-5 text-sm font-semibold hover:bg-paper"
            :disabled="billingLoading"
            @click="loadBilling"
          >
            Retry
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
