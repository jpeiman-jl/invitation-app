import { z } from "zod";

const emailSchema = z.string().trim().email();

export function isEmailEligible(email: string | null | undefined): email is string {
  return typeof email === "string" && emailSchema.safeParse(email).success;
}
