import "server-only";
import { z } from "zod";
import { SIGN_IN_LOCKOUT, SIGN_IN_MAX_FAILURES } from "@/config/provisional";
import type { Role } from "@/lib/roles";
import { auth } from "@/server/data/auth/better-auth";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { clearAttempts, isLocked, recordFailure } from "@/server/data/auth/throttle";
import { emailSchema } from "./schemas";

// AUTH-02, without Next request APIs so integration tests can call it.
// The Server Action supplies the request headers (cookies are set by nextCookies()).

export const signInSchema = z.object({
  email: emailSchema,
  // No length rule here: a wrong password must fail like any other, not as "too short".
  password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }),
});

export type SignInField = "email" | "password";

export type SignInState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<SignInField, string>>; email: string }
  | { status: "rejected"; email: string }
  | { status: "unconfirmed"; email: string }
  | { status: "done"; role: Role; userId: string };

function errorCode(error: unknown): string | undefined {
  return (error as { body?: { code?: string } } | null)?.body?.code;
}

export async function signInUser(raw: unknown, ctx: { headers: Headers }): Promise<SignInState> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const input = (raw ?? {}) as Record<string, unknown>;
    return {
      status: "invalid",
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, messages]) => [field, messages?.[0]]),
      ),
      email: typeof input.email === "string" ? input.email : "",
    };
  }
  const { email, password } = parsed.data;

  // Checked before the password: during a lockout even the right password fails (CA3).
  if (await isLocked("sign_in_email", email)) return { status: "rejected", email };

  try {
    const result = await auth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: ctx.headers,
    });
    await clearAttempts("sign_in_email", email);
    await recordSecurityEvent("sign_in_succeeded", { actorUserId: result.user.id, subjectId: result.user.id });
    return { status: "done", role: (result.user as { role: Role }).role, userId: result.user.id };
  } catch (error) {
    const code = errorCode(error);
    // Right password, unconfirmed address: no session, a way forward (R3).
    if (code === "EMAIL_NOT_VERIFIED") return { status: "unconfirmed", email };
    if (code !== "INVALID_EMAIL_OR_PASSWORD") throw error;

    const { lockedNow } = await recordFailure("sign_in_email", email, {
      max: SIGN_IN_MAX_FAILURES,
      windowSeconds: SIGN_IN_LOCKOUT,
      lockSeconds: SIGN_IN_LOCKOUT,
    });
    await recordSecurityEvent(lockedNow ? "sign_in_locked" : "sign_in_failed");
    return { status: "rejected", email };
  }
}

/** Deletes the session in the database; the cookie is cleared by nextCookies(). */
export async function signOutUser(ctx: { headers: Headers; userId: string | null }): Promise<void> {
  await auth.api.signOut({ headers: ctx.headers });
  if (ctx.userId) await recordSecurityEvent("signed_out", { actorUserId: ctx.userId, subjectId: ctx.userId });
}
