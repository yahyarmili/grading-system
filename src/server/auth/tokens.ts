import { createHash, randomBytes } from "node:crypto";

// One-time link tokens (NFR-SEC-03): 256 random bits, sent once in clear by
// email, stored only as a SHA-256 digest.

/** 32 bytes in base64url: 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
