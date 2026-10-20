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

/** First administrator, created by the local script: sets the password of the account. */
export function adminSetupMessage(r: Recipient, url: string, validFor: string): EmailMessage {
  return {
    kind: "admin_setup",
    to: r.to,
    subject: "Set up your administrator account",
    text: `Hello ${r.firstName},

Your administrator account was created. Choose your password with this link:
${url}

This link works once and expires in ${validFor}.`,
  };
}

/**
 * E6 (EXP-02): the AI stopped for the whole application, to the
 * administrators. No student, submission or content: what happened and when
 * it ends only.
 */
export function aiAlertMessage(to: string, alert: "cost_cap" | "breaker" | "configuration", detail: string): EmailMessage {
  const what = {
    cost_cap: {
      subject: "AI stopped: monthly cost cap reached",
      body: `The estimated cost of the AI this month reached its cap (${detail}). New submissions become "AI unavailable" without any call until the first day of next month (UTC), or until the cap is raised. Teachers may then relaunch them.`,
    },
    breaker: {
      subject: "AI stopped: repeated access errors",
      body: `Several submissions failed in a row on an access error of the AI (key, model or request refused) (${detail}). No call is made until the window has passed; new submissions end "Evaluation failed". Check the key and the model.`,
    },
    configuration: {
      subject: "AI stopped: not configured",
      body: `The application could not set up the AI (${detail}). No call is made; new submissions end "Evaluation failed", and teachers may retry them once the configuration is fixed.`,
    },
  }[alert];
  return { kind: "ai_alert", to, subject: what.subject, text: `Hello,\n\n${what.body}` };
}
