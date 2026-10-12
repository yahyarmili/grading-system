import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/duration";
import { signUpSchema, tokenSchema } from "./schemas";
import { generateToken, hashToken, TOKEN_PATTERN } from "./tokens";

const valid = { firstName: " Sam ", lastName: "Lee", email: "  Sam.Lee@Example.TEST ", password: "long enough" };

describe("signUpSchema", () => {
  it("normalises the email and trims names", () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe("sam.lee@example.test");
    expect(parsed.firstName).toBe("Sam");
  });

  it("drops fields that are not part of sign-up, such as a role (AUTH-01 CA3)", () => {
    const parsed = signUpSchema.parse({ ...valid, role: "admin", emailVerified: true });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("emailVerified");
  });

  it("refuses a short password, an invalid email and empty names", () => {
    const result = signUpSchema.safeParse({ firstName: " ", lastName: "", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["firstName", "lastName", "email", "password"]));
  });

  it("asks for a missing email rather than calling it invalid", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "   " });
    const messages = result.error!.issues.filter((i) => i.path[0] === "email").map((i) => i.message);
    expect(messages).toEqual(["Enter your email address."]);
  });
});

describe("one-time tokens", () => {
  it("are 43 base64url characters, stored as a digest", () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(TOKEN_PATTERN);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toContain(token);
  });

  it("differ on each call", () => {
    expect(generateToken().token).not.toBe(generateToken().token);
  });

  it("are refused when malformed", () => {
    expect(tokenSchema.safeParse("abc").success).toBe(false);
    expect(tokenSchema.safeParse(`${generateToken().token}!`).success).toBe(false);
    expect(tokenSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("formatDuration", () => {
  it("uses the largest exact unit", () => {
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(7 * 86400)).toBe("7 days");
    expect(formatDuration(15 * 60)).toBe("15 minutes");
    expect(formatDuration(90)).toBe("90 seconds");
  });
});
