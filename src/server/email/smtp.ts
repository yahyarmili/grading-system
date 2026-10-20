import nodemailer from "nodemailer";
import { AI_ALERT_SEND_MAX_MS } from "@/config/provisional";
import type { EmailMessage, EmailSender } from "./types";

/**
 * Gmail SMTP with an app password: demonstration only (stack-technologique.md).
 * Each phase is bounded (E6.6): the defaults wait for minutes, longer than an
 * evaluation step may.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter;

  constructor(private readonly user: string, password: string) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: password },
      connectionTimeout: AI_ALERT_SEND_MAX_MS,
      greetingTimeout: AI_ALERT_SEND_MAX_MS,
      socketTimeout: AI_ALERT_SEND_MAX_MS,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.user,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      // NFR-DON-05: the kind only, never the recipient, the link or the provider's message.
      console.error(`[email] sending failed (${message.kind})`);
      throw error;
    }
  }
}
