import { PrismaClient } from "@prisma/client";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const prisma = new PrismaClient();

try {
  await prisma.plan.upsert({
    where: { key: "free" },
    create: {
      key: "free",
      name: "Free",
      priceCents: 0,
      currency: "usd",
      guestLimit: config.FREE_GUEST_LIMIT,
      activeEventLimit: config.FREE_ACTIVE_EVENT_LIMIT,
      maxDesignGenerations: 0,
      features: { customDesign: false, higherGuestLimit: false },
      isActive: true
    },
    update: {
      name: "Free",
      priceCents: 0,
      currency: "usd",
      guestLimit: config.FREE_GUEST_LIMIT,
      activeEventLimit: config.FREE_ACTIVE_EVENT_LIMIT,
      maxDesignGenerations: 0,
      features: { customDesign: false, higherGuestLimit: false },
      isActive: true
    }
  });

  await prisma.plan.upsert({
    where: { key: "custom_design" },
    create: {
      key: "custom_design",
      name: "Custom Design",
      priceCents: config.CUSTOM_DESIGN_PRICE_CENTS,
      currency: "usd",
      guestLimit: config.CUSTOM_DESIGN_GUEST_LIMIT,
      activeEventLimit: config.CUSTOM_DESIGN_ACTIVE_EVENT_LIMIT,
      maxDesignGenerations: config.CUSTOM_DESIGN_MAX_GENERATIONS,
      features: { customDesign: true, higherGuestLimit: true },
      isActive: true
    },
    update: {
      name: "Custom Design",
      priceCents: config.CUSTOM_DESIGN_PRICE_CENTS,
      currency: "usd",
      guestLimit: config.CUSTOM_DESIGN_GUEST_LIMIT,
      activeEventLimit: config.CUSTOM_DESIGN_ACTIVE_EVENT_LIMIT,
      maxDesignGenerations: config.CUSTOM_DESIGN_MAX_GENERATIONS,
      features: { customDesign: true, higherGuestLimit: true },
      isActive: true
    }
  });
} finally {
  await prisma.$disconnect();
}
