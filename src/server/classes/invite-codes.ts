import { createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

// Class invitation link and code (CLS-02, NFR-SEC-03). Neither is stored: both
// are derived from the class's nonce with a key drawn from BETTER_AUTH_SECRET,
// so the teacher can see them again at any time. Only digests are stored, for
// lookup. Changing BETTER_AUTH_SECRET changes every link and code.

/** Crockford Base32: no I, L, O, U, so a code read aloud or copied by hand stays unambiguous. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** [P] 8 symbols of 5 bits: 40 bits, against a limited number of attempts (CLS-02 R3). */
export const CODE_LENGTH = 8;

/** Key of the invitations, separate from Better Auth's own uses of the secret. */
export function inviteKey(secret = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "", "class-invite", 32));
}

const hmac = (key: Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** First CODE_LENGTH × 5 = 40 bits of the bytes, in Crockford Base32 (40 bits fit in a number). */
function base32(bytes: Buffer): string {
  let bits = bytes.readUIntBE(0, 5);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out = CROCKFORD[bits % 32] + out;
    bits = Math.floor(bits / 32);
  }
  return out;
}

/** The link token: 256 bits in base64url, 43 characters, like the one-time links. */
export function linkToken(key: Buffer, nonce: string): string {
  return hmac(key, `link:${nonce}`).toString("base64url");
}

/** The code, in canonical form (no separator). */
export function inviteCode(key: Buffer, nonce: string): string {
  return base32(hmac(key, `code:${nonce}`));
}

/** The link token has 256 bits: a plain digest is enough. */
export const linkDigest = (token: string) => createHash("sha256").update(token).digest("hex");

/** Keyed: with 40 bits, a plain digest leaked with the database could be reversed by brute force. */
export const codeDigest = (key: Buffer, code: string) => hmac(key, `lookup:${code}`).toString("hex");

/** A fresh invitation: the nonce to store and the digests to look it up. */
export function newInvite(key = inviteKey()): { nonce: string; linkDigest: string; codeDigest: string } {
  const nonce = randomBytes(32).toString("base64url");
  return { nonce, linkDigest: linkDigest(linkToken(key, nonce)), codeDigest: codeDigest(key, inviteCode(key, nonce)) };
}

/** "ABCD-EFGH": easier to read and to type. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * A typed code in canonical form, or null if it cannot be one: any case,
 * spaces and hyphens ignored, and the letters people confuse read as digits
 * (O as 0, I and L as 1), as Crockford Base32 intends.
 */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return code.length === CODE_LENGTH && [...code].every((c) => CROCKFORD.includes(c)) ? code : null;
}

/** The link token, as it appears in the URL: refused at once if malformed. */
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Whether a class's link and code work (CLS-02 R3): not disabled, and not
 * older than the lifetime when one is set (Q7: none for now).
 */
export function isInviteUsable(
  invite: { disabledAt: Date | null; issuedAt: Date },
  ttlSeconds: number | null,
  now: Date,
): boolean {
  if (invite.disabledAt) return false;
  return ttlSeconds === null || now.getTime() < invite.issuedAt.getTime() + ttlSeconds * 1000;
}
