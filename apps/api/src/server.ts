import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { BullMqEmailQueue } from "./email.js";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const prisma = new PrismaClient();
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const emailQueue = new BullMqEmailQueue(redis);
const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
const app = await createApp({ config, prisma, emailQueue, stripe });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
  await emailQueue.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error({ err: error }, "Failed to start API");
  await emailQueue.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exitCode = 1;
}
