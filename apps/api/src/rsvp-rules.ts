import type { RsvpInput } from "@invitehub/shared";
import { HttpError } from "./errors.js";

export function normalizeRsvp(input: RsvpInput, maxPartySize: number): {
  partySize: number;
  companionNames: string[];
} {
  if (input.status !== "ATTENDING") {
    if (input.companionNames.length > 0 || (input.partySize !== undefined && input.partySize !== 0)) {
      throw new HttpError(400, "Party details are only accepted for attending RSVPs", "PARTY_DETAILS_INVALID");
    }
    return { partySize: 0, companionNames: [] };
  }

  if (input.partySize === undefined || input.partySize < 1 || input.partySize > maxPartySize) {
    throw new HttpError(400, `Party size must be between 1 and ${maxPartySize}`, "PARTY_SIZE_INVALID");
  }
  if (input.companionNames.length > input.partySize - 1) {
    throw new HttpError(400, "There cannot be more companion names than companion seats", "COMPANION_NAMES_INVALID");
  }
  return { partySize: input.partySize, companionNames: input.companionNames };
}
