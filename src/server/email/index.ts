import "server-only";
import path from "node:path";
import { CaptureEmailSender } from "./capture";
import { SmtpEmailSender } from "./smtp";
import type { EmailSender } from "./types";

export type { EmailKind, EmailMessage, EmailSender } from "./types";
export { CaptureEmailSender, type CapturedEmail } from "./capture";

type EmailEnv = {
  NODE_ENV?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  /** "capture" forces the capture transport (E2E server), even with SMTP variables. */
  EMAIL_TRANSPORT?: string;
  /** Where captured messages are written; default .mail-capture/ in development. */
  MAIL_CAPTURE_DIR?: string;
};

/** Tests and the E2E server always capture; otherwise SMTP as soon as both SMTP variables exist. */
export function selectTransport(env: EmailEnv): "capture" | "smtp" {
  if (env.NODE_ENV === "test" || env.EMAIL_TRANSPORT === "capture") return "capture";
  return env.SMTP_USER && env.SMTP_PASSWORD ? "smtp" : "capture";
}

function createSender(env: EmailEnv): EmailSender {
  if (selectTransport(env) === "smtp") {
    return new SmtpEmailSender(env.SMTP_USER!, env.SMTP_PASSWORD!);
  }
  const directory =
    env.MAIL_CAPTURE_DIR ??
    (env.NODE_ENV === "development" ? path.join(process.cwd(), ".mail-capture") : undefined);
  return new CaptureEmailSender(directory);
}

// One sender per process, kept across hot reloads like the database pool.
const globalForEmail = globalThis as unknown as { emailSender?: EmailSender };

/** The only way the application sends an email. */
export function getEmailSender(): EmailSender {
  globalForEmail.emailSender ??= createSender(process.env);
  return globalForEmail.emailSender;
}

/** Tests: the capture transport, to read messages and inject failures. */
export function getCaptureSender(): CaptureEmailSender {
  const sender = getEmailSender();
  if (!(sender instanceof CaptureEmailSender)) {
    throw new Error("The capture transport is not active");
  }
  return sender;
}
