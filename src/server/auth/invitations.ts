import "server-only";
import { z } from "zod";
import { TEACHER_INVITATION_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { auth } from "@/server/data/auth/better-auth";
import {
  acceptTeacherInvitation,
  cancelTeacherInvitation,
  createTeacherInvitation,
  reissueTeacherInvitation,
  type InvitationToSend,
} from "@/server/data/auth/invitations";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { getEmailSender } from "@/server/email";
import { teacherInvitationMessage } from "@/server/email/templates";
import { emailSchema, passwordSchema, tokenSchema } from "./schemas";
import { appUrl } from "./urls";

// AUTH-03, without Next request APIs so integration tests can call it.
// The administrator is told plainly what happened: no enumeration concern on
// this side, and a failed email must be visible to be reissued.

export const NOT_ALLOWED = "You are not allowed to do this.";

function nameSchema(label: string) {
  return z
    .string({ error: `Enter the ${label}.` })
    .trim()
    .min(1, { error: `Enter the ${label}.` })
    .max(100, { error: `Use at most 100 characters for the ${label}.` });
}

export const invitationSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  email: emailSchema,
});

export type InvitationField = "firstName" | "lastName" | "email";

export type InviteState =
  | { status: "idle" }
  | {
      status: "invalid" | "refused";
      fieldErrors: Partial<Record<InvitationField, string>>;
      values: Partial<Record<InvitationField, string>>;
    }
  | { status: "error"; message: string }
  | { status: "done"; email: string; emailSent: boolean };

/** Sends the invitation now: the administrator learns at once if the email failed. */
async function sendInvitation(invitation: InvitationToSend): Promise<boolean> {
  const url = appUrl("/invitation", { token: invitation.token });
  try {
    await getEmailSender().send(
      teacherInvitationMessage(invitation, url, formatDuration(TEACHER_INVITATION_TTL)),
    );
    return true;
  } catch {
    return false;
  }
}

/** A refused admin action is logged (NFR-DON-05), then answered without detail. */
async function refuse(actor: Actor) {
  await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
  return NOT_ALLOWED;
}

function textValues(raw: unknown): Partial<Record<InvitationField, string>> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  return { firstName: text("firstName"), lastName: text("lastName"), email: text("email") };
}

export async function inviteTeacher(actor: Actor, raw: unknown): Promise<InviteState> {
  const parsed = invitationSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      status: "invalid",
      fieldErrors: Object.fromEntries(Object.entries(fieldErrors).map(([f, m]) => [f, m?.[0]])),
      values: textValues(raw),
    };
  }
  let result;
  try {
    result = await createTeacherInvitation(actor, parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { status: "error", message: await refuse(actor) };
    throw error;
  }
  if (!result.ok) {
    return {
      status: "refused",
      fieldErrors: {
        email:
          result.reason === "email_taken"
            ? "This email already has an account. One account has one role: use another email."
            : "An invitation is already open for this email. Reissue or cancel it in the list.",
      },
      values: textValues(raw),
    };
  }
  return { status: "done", email: parsed.data.email, emailSent: await sendInvitation(result.invitation) };
}

export type InvitationActionResult = { ok: boolean; message: string };

const idSchema = z.uuid();

export async function reissueInvitation(actor: Actor, rawId: unknown): Promise<InvitationActionResult> {
  const id = idSchema.safeParse(rawId);
  try {
    const invitation = id.success ? await reissueTeacherInvitation(actor, id.data) : null;
    if (!invitation) return { ok: false, message: "This invitation is no longer open: it was accepted or cancelled." };
    return (await sendInvitation(invitation))
      ? { ok: true, message: `A new link was sent to ${invitation.to}. The previous link no longer works.` }
      : { ok: false, message: `A new link was created, but the email to ${invitation.to} could not be sent. Try again.` };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, message: await refuse(actor) };
    throw error;
  }
}

export async function cancelInvitation(actor: Actor, rawId: unknown): Promise<InvitationActionResult> {
  const id = idSchema.safeParse(rawId);
  try {
    const cancelled = id.success ? await cancelTeacherInvitation(actor, id.data) : false;
    return cancelled
      ? { ok: true, message: "The invitation was cancelled. Its link no longer works." }
      : { ok: false, message: "This invitation is no longer open: it was accepted or cancelled." };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, message: await refuse(actor) };
    throw error;
  }
}

export type AcceptInvitationState =
  | { status: "idle" }
  | { status: "invalid"; error: string }
  | { status: "invalid-link" }
  | { status: "done" };

/**
 * The teacher sets a password; the account is created and signed in
 * (cookies set by nextCookies() in a Server Action).
 */
export async function acceptInvitation(
  raw: { token: unknown; password: unknown },
  ctx: { headers: Headers },
): Promise<AcceptInvitationState> {
  const token = tokenSchema.safeParse(raw.token);
  if (!token.success) return { status: "invalid-link" };
  const password = passwordSchema.safeParse(raw.password);
  if (!password.success) return { status: "invalid", error: password.error.issues[0]?.message ?? "Enter a password." };

  const accepted = await acceptTeacherInvitation(token.data, password.data);
  if (!accepted) return { status: "invalid-link" };
  await auth.api.signInEmail({ body: { email: accepted.email, password: password.data }, headers: ctx.headers });
  return { status: "done" };
}
