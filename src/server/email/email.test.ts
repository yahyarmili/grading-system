import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_ALERT_SEND_MAX_MS } from "@/config/provisional";
import { CaptureEmailSender, getCaptureSender, getEmailSender, selectTransport } from ".";
import { SmtpEmailSender } from "./smtp";
import { emailVerificationMessage } from "./templates";

const message = emailVerificationMessage(
  { to: "student@example.test", firstName: "Sam" },
  "http://localhost:3000/verify-email?token=abc",
  "1 hour",
);

describe("selectTransport", () => {
  it("always captures in tests, even with SMTP variables", () => {
    expect(selectTransport({ NODE_ENV: "test", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toBe("capture");
  });

  it("uses SMTP only when both variables exist", () => {
    expect(selectTransport({ NODE_ENV: "development", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toBe("smtp");
    expect(selectTransport({ NODE_ENV: "development", SMTP_USER: "u" })).toBe("capture");
    expect(selectTransport({ NODE_ENV: "production" })).toBe("capture");
    expect(selectTransport({ NODE_ENV: "development", SMTP_USER: "u", SMTP_PASSWORD: "p", EMAIL_TRANSPORT: "capture" })).toBe(
      "capture",
    );
  });
});

describe("SmtpEmailSender", () => {
  it("bounds each phase of the connection (E6.6): never minutes inside an evaluation step", () => {
    // Nothing is sent: the transport connects on the first sendMail only.
    const sender = new SmtpEmailSender("sender@example.test", "app-password");
    const options = (sender as unknown as { transporter: { options: Record<string, unknown> } }).transporter.options;
    expect(options).toMatchObject({
      connectionTimeout: AI_ALERT_SEND_MAX_MS,
      greetingTimeout: AI_ALERT_SEND_MAX_MS,
      socketTimeout: AI_ALERT_SEND_MAX_MS,
    });
  });
});

describe("CaptureEmailSender", () => {
  it("keeps sent messages until cleared", async () => {
    const sender = new CaptureEmailSender();
    await sender.send(message);
    expect(sender.captured()).toHaveLength(1);
    expect(sender.captured()[0]).toMatchObject({ kind: "email_verification", to: "student@example.test" });
    sender.clear();
    expect(sender.captured()).toHaveLength(0);
  });

  it("fails once on demand, without capturing", async () => {
    const sender = new CaptureEmailSender();
    sender.failNext(new Error("SMTP down"));
    await expect(sender.send(message)).rejects.toThrow("SMTP down");
    expect(sender.captured()).toHaveLength(0);
    await sender.send(message);
    expect(sender.captured()).toHaveLength(1);
  });

  it("writes each message as JSON when given a directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mail-"));
    try {
      await new CaptureEmailSender(directory).send(message);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const saved = JSON.parse(await readFile(path.join(directory, files[0]), "utf8"));
      expect(saved.text).toContain("verify-email?token=abc");
      expect(saved.links).toEqual(["http://localhost:3000/verify-email?token=abc"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("getEmailSender", () => {
  it("is the capture transport under test", async () => {
    expect(getEmailSender()).toBe(getCaptureSender());
    await getEmailSender().send(message);
    expect(getCaptureSender().captured().at(-1)?.subject).toBe("Confirm your email address");
    getCaptureSender().clear();
  });
});
