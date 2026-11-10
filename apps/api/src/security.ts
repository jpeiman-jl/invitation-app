import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AppConfig } from "./config.js";

const INVITATION_TOKEN_BYTES = 32;

function encryptionKey(config: AppConfig): Buffer {
  const key = Buffer.from(config.INVITATION_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length === 32) {
    return key;
  }
  return createHash("sha256").update(config.INVITATION_TOKEN_ENCRYPTION_KEY).digest();
}

export function createInvitationToken(config: AppConfig): { token: string; tokenHash: string; tokenCiphertext: string } {
  const token = randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(config), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    token,
    tokenHash: hashToken(token),
    tokenCiphertext: Buffer.concat([iv, tag, ciphertext]).toString("base64")
  };
}

export function decryptInvitationToken(tokenCiphertext: string, config: AppConfig): string {
  const payload = Buffer.from(tokenCiphertext, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(config), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationUrl(token: string, config: AppConfig): string {
  return new URL(`/i/${token}`, config.WEB_ORIGIN).toString();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(passwordDigest(password), 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(passwordDigest(password), passwordHash);
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function passwordDigest(password: string): string {
  return createHash("sha256").update("invitehub-password-v1\0").update(password, "utf8").digest("base64");
}
