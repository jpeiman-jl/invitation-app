import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { loadConfig } from "./config.js";
import { createEmailWorker, ResendEmailProvider } from "./email.js";

const config = loadConfig();
if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
  throw new Error("RESEND_API_KEY and EMAIL_FROM are required to run the email worker");
}

const prisma = new PrismaClient();
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const worker = createEmailWorker(
  redis,
  prisma,
  new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM)
);

const shutdown = async (): Promise<void> => {
  await worker.close();
  await redis.quit();
  await prisma.$disconnect();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
