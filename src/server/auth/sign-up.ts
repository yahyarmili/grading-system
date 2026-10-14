import "server-only";
import { z } from "zod";
import { EMAIL_VERIFICATION_TTL, SIGN_UP_MAX_PER_IP, SIGN_UP_WINDOW } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { confirmEmail, registerStudent } from "@/server/data/auth/accounts";
import { countAttempt } from "@/server/data/auth/throttle";
import { getEmailSender, type EmailMessage } from "@/server/email";
import { accountExistsMessage, emailVerificationMessage } from "@/server/email/templates";
import { signUpSchema, tokenSchema } from "./schemas";
import { appUrl } from "./urls";

// AUTH-01, without Next request APIs so integration tests can call it.
// The Server Actions (src/app/(auth)/actions.ts) supply the actor, the IP and after().

export type SignUpField = "firstName" | "lastName" | "email" | "password";

export type SignUpState =
  | { status: "idle" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<SignUpField, string>>;
      /** Typed values given back to the form; never the password. */
      values: Partial<Record<Exclude<SignUpField, "password">, string>>;
    }
  | { status: "error"; message: string }
  | { status: "done" };

export const SIGN_UP_MESSAGES = {
  tooMany: "Too many sign-up attempts from this network. Try again later.",
  notAvailable: "You are already signed in. Sign out to create another account.",
} as const;

type Context = {
  actor: Actor;
  ip: string;
  /** Runs the email after the response (after() in a Server Action): same timing for every outcome. */
  schedule: (task: () => Promise<void>) => void;
  /** A class link opened before signing up (cookie), joined at confirmation (CLS-03 R3). */
  inviteToken?: string;
};

function sendLater(schedule: Context["schedule"], message: EmailMessage) {
  schedule(async () => {
    try {
      await getEmailSender().send(message);
    } catch {
      // Already logged without personal data by the transport; the screen does not change.
    }
  });
}

/** Same "done" for a new, an unconfirmed and a confirmed email (AUTH-01 CA2). */
export async function signUpStudent(raw: unknown, ctx: Context): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const input = (raw ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
    return {
      status: "invalid",
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, messages]) => [field, messages?.[0]]),
      ),
      values: { firstName: text("firstName"), lastName: text("lastName"), email: text("email") },
    };
  }

  if (ctx.actor.kind !== "visitor") return { status: "error", message: SIGN_UP_MESSAGES.notAvailable };

  const { allowed } = await countAttempt("sign_up_ip", ctx.ip, {
    max: SIGN_UP_MAX_PER_IP,
    windowSeconds: SIGN_UP_WINDOW,
  });
  if (!allowed) return { status: "error", message: SIGN_UP_MESSAGES.tooMany };

  let registration;
  try {
    registration = await registerStudent(ctx.actor, parsed.data, { inviteToken: ctx.inviteToken });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { status: "error", message: SIGN_UP_MESSAGES.notAvailable };
    }
    throw error;
  }

  if (registration.outcome === "created" || registration.outcome === "unconfirmed") {
    const url = appUrl("/verify-email", { token: registration.verificationToken });
    sendLater(
      ctx.schedule,
      emailVerificationMessage(registration, url, formatDuration(EMAIL_VERIFICATION_TTL)),
    );
  } else if (registration.outcome === "confirmed") {
    sendLater(
      ctx.schedule,
      accountExistsMessage(registration, appUrl("/sign-in"), appUrl("/forgot-password")),
    );
  }
  return { status: "done" };
}

export type ConfirmEmailState = { status: "idle" } | { status: "invalid" } | { status: "done" };

/** Expired, used, revoked, forged or malformed: one answer (AUTH-01 CA4). */
export async function confirmEmailWithToken(raw: unknown): Promise<ConfirmEmailState> {
  const token = tokenSchema.safeParse(raw);
  if (!token.success) return { status: "invalid" };
  return (await confirmEmail(token.data)) ? { status: "done" } : { status: "invalid" };
}
