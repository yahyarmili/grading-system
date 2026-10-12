import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailMessage, EmailSender } from "./types";

export type CapturedEmail = EmailMessage & { sentAt: Date };

/**
 * Transport for development and tests: nothing leaves the machine.
 * Keeps messages in memory; with a directory, also writes each one as JSON
 * (development, git-ignored; the links listed first). failNext() injects a failure (NFR-EXP-04).
 */
export class CaptureEmailSender implements EmailSender {
  private messages: CapturedEmail[] = [];
  private pendingFailure: Error | null = null;

  constructor(private readonly directory?: string) {}

  async send(message: EmailMessage): Promise<void> {
    if (this.pendingFailure) {
      const failure = this.pendingFailure;
      this.pendingFailure = null;
      throw failure;
    }
    const captured = { ...message, sentAt: new Date() };
    this.messages.push(captured);
    if (this.directory) {
      await mkdir(this.directory, { recursive: true });
      const file = `${captured.sentAt.getTime()}-${message.kind}.json`;
      // In JSON the text is one line with "\n": copying a link from it drags
      // the next words along. The links are listed alone, ready to copy.
      const links = message.text.match(/https?:\/\/\S+/g) ?? [];
      await writeFile(path.join(this.directory, file), JSON.stringify({ links, ...captured }, null, 2));
    }
  }

  /** Messages sent since the last clear(), oldest first. */
  captured(): readonly CapturedEmail[] {
    return this.messages;
  }

  clear(): void {
    this.messages = [];
    this.pendingFailure = null;
  }

  /** The next send() throws this error and captures nothing. */
  failNext(error: Error = new Error("Injected email failure")): void {
    this.pendingFailure = error;
  }
}
