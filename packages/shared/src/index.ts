import { z } from "zod";
import { DEFAULT_TEMPLATE_KEYS, type DefaultTemplateKey } from "./templates.js";

export { DEFAULT_TEMPLATE_KEYS, DEFAULT_TEMPLATES } from "./templates.js";
export type { DefaultTemplate, DefaultTemplateKey } from "./templates.js";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const httpUrl = (max: number) => z.string().url().max(max)
  .refine((value) => /^https?:\/\//i.test(value), "URL must use HTTP or HTTPS")
  .nullable()
  .optional();
const timeZone = z.string().trim().min(1).max(64).refine((value) => {
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA time zone");

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(160)
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128)
});

export const emailAddressSchema = z.string().trim().email().max(320);

export const eventProgramItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  time: optionalText(32),
  lead: optionalText(160),
  description: optionalText(1000)
});

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  hostNames: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  startsAt: z.string().datetime({ offset: true }),
  timeZone,
  occasionTypes: z.array(z.enum(DEFAULT_TEMPLATE_KEYS)).min(1).max(DEFAULT_TEMPLATE_KEYS.length).default(["wedding"]),
  templateKey: z.enum(DEFAULT_TEMPLATE_KEYS).default("wedding"),
  venue: optionalText(200),
  address: optionalText(500),
  mapUrl: httpUrl(2048),
  description: optionalText(10_000),
  dressCode: optionalText(200),
  programItems: z.array(eventProgramItemSchema).max(50).default([]),
  rsvpDeadline: z.string().datetime({ offset: true }).nullable().optional(),
  coverImageUrl: httpUrl(2048),
  publicGuestLookupEnabled: z.boolean().default(false),
  publicSlug: z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/).nullable().optional()
});

export const updateEventSchema = createEventSchema.partial();

const guestFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.union([emailAddressSchema, z.literal("")]).nullable().optional(),
  phone: optionalText(40),
  household: optionalText(160),
  maxPartySize: z.number().int().min(1).max(50).default(1),
  notes: optionalText(10_000),
  dietaryRestrictions: optionalText(10_000)
});

export const createGuestSchema = guestFieldsSchema.transform((guest) => ({
  ...guest,
  email: guest.email === "" ? null : guest.email?.toLowerCase() ?? null
}));

export const updateGuestSchema = guestFieldsSchema.partial().transform((guest) => ({
  ...guest,
  ...(guest.email !== undefined
    ? { email: guest.email === "" || guest.email === null ? null : guest.email.toLowerCase() }
    : {})
}));

export const importGuestsSchema = z.object({
  csv: z.string().min(1).max(2_000_000)
});

export const sendInvitationsSchema = z.object({
  guestIds: z.array(z.string().uuid()).min(1).max(500)
});

export const rsvpSchema = z.object({
  status: z.enum(["ATTENDING", "DECLINED", "MAYBE"]),
  partySize: z.number().int().min(0).max(50).optional(),
  companionNames: z.array(z.string().trim().min(1).max(160)).max(49).default([]),
  dietary: optionalText(10_000),
  message: optionalText(10_000)
});

export const EVENT_TABLE_TYPES = [
  "ROUND",
  "RECTANGULAR",
  "SQUARE",
  "BANQUET",
  "HEAD",
  "SWEETHEART",
  "COCKTAIL",
  "CUSTOM"
] as const;

const eventTableFieldsSchema = z.object({
  label: z.string().trim().min(1).max(100),
  type: z.enum(EVENT_TABLE_TYPES),
  customType: z.string().trim().min(1).max(100).nullable().optional(),
  capacity: z.number().int().min(1).max(500),
  positionX: z.number().min(0).max(100).default(50),
  positionY: z.number().min(0).max(100).default(50)
});

function validateCustomTableType(
  table: { type?: string; customType?: string | null },
  context: z.RefinementCtx
): void {
  if (table.type === "CUSTOM" && !table.customType?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customType"],
      message: "Provide a name for a custom table type"
    });
  } else if (table.type !== "CUSTOM" && table.customType?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customType"],
      message: "Custom type names are only used for custom tables"
    });
  }
}

export const createEventTableSchema = eventTableFieldsSchema.superRefine(validateCustomTableType);
export const updateEventTableSchema = eventTableFieldsSchema.partial();

export const assignGuestToSeatSchema = z.object({
  guestId: z.string().uuid(),
  seatNumber: z.number().int().min(1).max(500).optional()
});

export const moveSeatAssignmentSchema = z.object({
  tableId: z.string().uuid(),
  seatNumber: z.number().int().min(1).max(500)
});

export const publishSeatingSchema = z.object({
  published: z.boolean()
});

export const invitationTokenParamsSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/)
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type EventProgramItem = z.infer<typeof eventProgramItemSchema>;
export type OccasionType = DefaultTemplateKey;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
export type EventTableType = typeof EVENT_TABLE_TYPES[number];
