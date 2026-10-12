import type { EmailMessage } from "./types";

// Application content is in English (CLAUDE.md). Plain text only for now.
// Lifetimes are shown as text computed from src/config/provisional.ts by the caller.

type Recipient = { to: string; firstName: string };

export function emailVerificationMessage(r: Recipient, url: string, validFor: string): EmailMessage {
  return {
    kind: "email_verification",
    to: r.to,
    subject: "Confirm your email address",
    text: `Hello ${r.firstName},

Confirm your email address to finish creating your student account:
${url}

This link works once and expires in ${validFor}. If you did not sign up, ignore this email.`,
  };
}

export function passwordResetMessage(r: Recipient, url: string, validFor: string): EmailMessage {
  return {
    kind: "password_reset",
    to: r.to,
    subject: "Reset your password",
    text: `Hello ${r.firstName},

Choose a new password with this link:
${url}

This link works once and expires in ${validFor}. If you did not ask for it, ignore this email: your password stays the same.`,
  };
}

export function teacherInvitationMessage(r: Recipient, url: string, validFor: string): EmailMessage {
  return {
    kind: "teacher_invitation",
    to: r.to,
    subject: "You are invited to grade as a teacher",
    text: `Hello ${r.firstName},

An administrator created a teacher account for you. Choose your password with this link:
${url}

This link works once and expires in ${validFor}.`,
  };
}

/** Sign-up with an email that already has an account: same screen, this email instead (AUTH-01 CA2). */
export function accountExistsMessage(r: Recipient, signInUrl: string, resetUrl: string): EmailMessage {
  return {
    kind: "account_exists",
    to: r.to,
    subject: "You already have an account",
    text: `Hello ${r.firstName},

Someone tried to sign up with this email address, which already has an account.
Sign in: ${signInUrl}
Forgot your password? ${resetUrl}

If it was not you, ignore this email.`,
  };
}
