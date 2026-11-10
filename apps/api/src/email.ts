import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { Resend } from "resend";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";

export type EmailKind = "INVITATION" | "REMINDER" | "RSVP_CONFIRMATION";

export interface EmailJob {
  emailLogId: string;
  invitationId?: string;
  kind: EmailKind;
  recipient: string;
  recipientName: string;
  eventTitle: string;
  eventStartsAt: string;
  invitationUrl?: string;
}

export interface EmailQueue {
  enqueue(job: EmailJob): Promise<void>;
  close(): Promise<void>;
}

export interface EmailProvider {
  send(job: EmailJob): Promise<string>;
}

export class BullMqEmailQueue implements EmailQueue {
  private readonly queue: Queue<EmailJob>;

  constructor(redis: Redis) {
    this.queue = new Queue<EmailJob>("invitehub-email", {
      connection: redis,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000
      }
    });
  }

  async enqueue(job: EmailJob): Promise<void> {
    await this.queue.add(job.kind.toLowerCase(), job, { jobId: job.emailLogId });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;

  constructor(private readonly apiKey: string, private readonly from: string) {
    this.resend = new Resend(apiKey);
  }

  async send(job: EmailJob): Promise<string> {
    const subject = job.kind === "INVITATION"
      ? `You're invited: ${job.eventTitle}`
      : job.kind === "REMINDER"
        ? `Reminder: ${job.eventTitle}`
        : `RSVP received: ${job.eventTitle}`;
    const date = new Date(job.eventStartsAt).toLocaleString("en", { dateStyle: "long", timeStyle: "short" });
    const action = job.kind === "RSVP_CONFIRMATION"
      ? "Your response has been recorded."
      : `Please respond for ${escapeHtml(job.eventTitle)}.`;
    const invitationLink = job.invitationUrl
      ? `<p><a href="${escapeHtml(job.invitationUrl)}">View invitation and RSVP</a></p>`
      : "";
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: job.recipient,
      subject,
      html: `<p>Hello ${escapeHtml(job.recipientName)},</p><p>${action}</p><p>${escapeHtml(job.eventTitle)} · ${escapeHtml(date)}</p>${invitationLink}`
    });
    if (error) {
      throw new Error(`Email provider rejected message: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("Email provider did not return a message ID");
    }
    return data.id;
  }
}

export function createEmailWorker(
  redis: Redis,
  prisma: PrismaClient,
  provider: EmailProvider
): Worker<EmailJob> {
  const worker = new Worker<EmailJob>("invitehub-email", async (job: Job<EmailJob>) => {
    const providerId = await provider.send(job.data);
    await prisma.emailLog.update({
      where: { id: job.data.emailLogId },
      data: { status: "SENT", provider: "resend", providerId, sentAt: new Date() }
    });
    if (job.data.invitationId && job.data.kind === "REMINDER") {
      await prisma.invitation.update({
        where: { id: job.data.invitationId },
        data: { remindedAt: new Date() }
      });
    } else if (job.data.invitationId && job.data.kind === "INVITATION") {
      await prisma.invitation.updateMany({
        where: { id: job.data.invitationId, status: "CREATED" },
        data: { status: "SENT", sentAt: new Date() }
      });
      await prisma.invitation.updateMany({
        where: { id: job.data.invitationId, sentAt: null },
        data: { sentAt: new Date() }
      });
    }
  }, {
    connection: redis,
    concurrency: 10
  });

  worker.on("failed", (job, error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    void prisma.emailLog.update({
      where: { id: job.data.emailLogId },
      data: { status: "FAILED", errorCode: error.name.slice(0, 100) }
    }).catch((updateError: unknown) => {
      console.error("Failed to persist terminal email failure", updateError);
    });
  });

  return worker;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#39;";
    }
  });
}
