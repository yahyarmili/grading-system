import "server-only";
import { z } from "zod";
import {
  EMAIL_VERIFICATION_TTL,
  LINK_REQUEST_MAX,
  LINK_REQUEST_WINDOW,
  PASSWORD_RESET_TTL,
} from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import {
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  type LinkToSend,
} from "@/server/data/auth/accounts";
import { countAttempt, type ThrottleScope } from "@/server/data/auth/throttle";
import { getEmailSender, type EmailMessage } from "@/server/email";
import { emailVerificationMessage, passwordResetMessage } from "@/server/email/templates";
import { emailSchema, passwordSchema, tokenSchema } from "./schemas";
import { appUrl } from "./urls";

// AUTH-05, without Next request APIs so integration tests can call it.
// Every request gets the same answer whether the email has an account or not:
// the only difference is an email, read by the owner of the address.

export type LinkRequestState =
  | { status: "idle" }
  | { status: "invalid"; error: string; email: string }
  | { status: "done" };

type Schedule = (task: () => Promise<void>) => void;

function sendLater(schedule: Schedule, message: EmailMessage) {
  schedule(async () => {
    try {
      await getEmailSender().send(message);
    } catch {
      // Already logged without personal data by the transport; the answer does not change.
    }
  });
}

const linkRequestSchema = z.object({ email: emailSchema });

async function handleLinkRequest(
  raw: unknown,
  scope: ThrottleScope,
  findLink: (email: string) => Promise<LinkToSend>,
  buildMessage: (link: NonNullable<LinkToSend>) => EmailMessage,
  schedule: Schedule,
): Promise<LinkRequestState> {
  const parsed = linkRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const input = (raw ?? {}) as Record<string, unknown>;
    return {
      status: "invalid",
      error: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      email: typeof input.email === "string" ? input.email : "",
    };
  }
  const { email } = parsed.data;

  // R3: beyond the limit, nothing is sent, and the answer stays the same.
  const { allowed } = await countAttempt(scope, email, {
    max: LINK_REQUEST_MAX,
    windowSeconds: LINK_REQUEST_WINDOW,
  });
  if (allowed) {
    const link = await findLink(email);
    if (link) sendLater(schedule, buildMessage(link));
  }
  return { status: "done" };
}

/** Forgot password (AUTH-05 R1, CA1). */
export function requestPasswordResetLink(raw: unknown, ctx: { schedule: Schedule }) {
  return handleLinkRequest(
    raw,
    "password_reset_email",
    requestPasswordReset,
    (link) =>
      passwordResetMessage(
        link,
        appUrl("/reset-password", { token: link.token }),
        formatDuration(PASSWORD_RESET_TTL),
      ),
    ctx.schedule,
  );
}

/** New confirmation link (AUTH-05 R2, CA3). */
export function requestConfirmationLink(raw: unknown, ctx: { schedule: Schedule }) {
  return handleLinkRequest(
    raw,
    "verification_email",
    requestEmailVerification,
    (link) =>
      emailVerificationMessage(
        link,
        appUrl("/verify-email", { token: link.token }),
        formatDuration(EMAIL_VERIFICATION_TTL),
      ),
    ctx.schedule,
  );
}

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "invalid"; error: string }
  | { status: "invalid-link" }
  | { status: "done" };

/** Expired, used, replaced, forged or malformed link: one answer (CA1). */
export async function resetPasswordWithToken(raw: {
  token: unknown;
  password: unknown;
}): Promise<ResetPasswordState> {
  const token = tokenSchema.safeParse(raw.token);
  if (!token.success) return { status: "invalid-link" };
  const password = passwordSchema.safeParse(raw.password);
  if (!password.success) {
    return { status: "invalid", error: password.error.issues[0]?.message ?? "Enter a password." };
  }
  return (await resetPassword(token.data, password.data)) ? { status: "done" } : { status: "invalid-link" };
}
