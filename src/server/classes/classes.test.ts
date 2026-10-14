import { describe, expect, it } from "vitest";
import { CLASS_INVITE_TTL } from "@/config/decisions";
import { CLASS_NAME_MAX_LENGTH } from "@/config/provisional";
import {
  CODE_LENGTH,
  codeDigest,
  formatCode,
  inviteCode,
  inviteKey,
  isInviteUsable,
  normalizeCode,
  linkDigest,
  linkToken,
  newInvite,
} from "./invite-codes";
import { classNameSchema } from "./schemas";

describe("class name (CLS-01)", () => {
  it("trims and collapses inner spaces", () => {
    expect(classNameSchema.parse("  Grade   10 —  A ")).toBe("Grade 10 — A");
  });

  it.each(["", "   ", "\n\t"])("refuses an empty name: %j", (name) => {
    expect(classNameSchema.safeParse(name).success).toBe(false);
  });

  it("refuses a name over the provisional maximum, after trimming", () => {
    expect(classNameSchema.safeParse("a".repeat(CLASS_NAME_MAX_LENGTH)).success).toBe(true);
    expect(classNameSchema.safeParse(` ${"a".repeat(CLASS_NAME_MAX_LENGTH)} `).success).toBe(true);
    expect(classNameSchema.safeParse("a".repeat(CLASS_NAME_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("refuses a value that is not text", () => {
    expect(classNameSchema.safeParse(null).success).toBe(false);
  });
});

describe("invitation link and code (CLS-02 R2)", () => {
  const key = inviteKey("test secret");
  const nonce = "nonce-1";

  it("derives the same link and code from the same nonce", () => {
    expect(linkToken(key, nonce)).toBe(linkToken(key, nonce));
    expect(inviteCode(key, nonce)).toBe(inviteCode(key, nonce));
  });

  it("gives another link and code for another nonce or another secret", () => {
    expect(linkToken(key, "nonce-2")).not.toBe(linkToken(key, nonce));
    expect(inviteCode(key, "nonce-2")).not.toBe(inviteCode(key, nonce));
    expect(inviteCode(inviteKey("other secret"), nonce)).not.toBe(inviteCode(key, nonce));
  });

  it("makes a 43-character link token, like the one-time links", () => {
    expect(linkToken(key, nonce)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("makes a code of Crockford Base32 symbols, without I, L, O, U", () => {
    for (let i = 0; i < 200; i++) {
      expect(inviteCode(key, `n${i}`)).toMatch(new RegExp(`^[0-9A-HJKMNP-TV-Z]{${CODE_LENGTH}}$`));
    }
  });

  it("shows the code in two groups", () => {
    expect(formatCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("stores digests only, the code's keyed", () => {
    const invite = newInvite(key);
    const token = linkToken(key, invite.nonce);
    const code = inviteCode(key, invite.nonce);
    expect(invite.linkDigest).toBe(linkDigest(token));
    expect(invite.codeDigest).toBe(codeDigest(key, code));
    expect(invite.codeDigest).not.toBe(codeDigest(inviteKey("other secret"), code));
    expect([invite.linkDigest, invite.codeDigest]).not.toContain(token);
    expect([invite.linkDigest, invite.codeDigest]).not.toContain(code);
  });

  it("refuses to run without a secret", () => {
    expect(() => inviteKey("")).toThrow();
  });
});

describe("typed code (CLS-02, CLS-03)", () => {
  it.each([
    ["ABCD-2345", "ABCD2345"],
    ["abcd 2345", "ABCD2345"],
    [" abcd-23 45 ", "ABCD2345"],
    ["OIL0-1234", "0110" + "1234"],
  ])("reads %j as %j", (typed, code) => {
    expect(normalizeCode(typed)).toBe(code);
  });

  it.each(["", "ABCD-234", "ABCD-23456", "ABCU-2345", "ABCD_2345", "ÀBCD-2345"])("refuses %j", (typed) => {
    expect(normalizeCode(typed)).toBeNull();
  });

  it("reads back every generated code once formatted", () => {
    const key = inviteKey("test secret");
    for (let i = 0; i < 50; i++) {
      const code = inviteCode(key, `n${i}`);
      expect(normalizeCode(formatCode(code).toLowerCase())).toBe(code);
    }
  });
});

describe("link and code validity (CLS-02 R3, R4, Q7)", () => {
  const issuedAt = new Date("2026-10-01T00:00:00Z");
  const later = (seconds: number) => new Date(issuedAt.getTime() + seconds * 1000);

  it("lasts 1 hour from the link's creation (Q7 decision)", () => {
    expect(CLASS_INVITE_TTL).toBe(60 * 60);
  });

  it("works until the lifetime ends, then expires", () => {
    expect(isInviteUsable({ disabledAt: null, issuedAt }, CLASS_INVITE_TTL, later(CLASS_INVITE_TTL - 1))).toBe(true);
    expect(isInviteUsable({ disabledAt: null, issuedAt }, CLASS_INVITE_TTL, later(CLASS_INVITE_TTL))).toBe(false);
  });

  it("stops at once when disabled", () => {
    expect(isInviteUsable({ disabledAt: later(1), issuedAt }, CLASS_INVITE_TTL, later(2))).toBe(false);
  });
});
