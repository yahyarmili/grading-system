/** The single email interface (stack-technologique.md §4, rule 3; NFR-EXP-04). */

export type EmailKind =
  | "email_verification"
  | "password_reset"
  | "teacher_invitation"
  | "account_exists"
  | "admin_setup"
  | "ai_alert";

export type EmailMessage = {
  /** Logged on failure instead of the recipient or the content. */
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
