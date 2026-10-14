import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_BASE_URL, E2E_MAIL_DIR, testDatabaseUrl } from "./env";

/** Test-only password for every account the journeys create. */
export const PASSWORD = "e2e-password-123";

/** A fresh address per journey: the test database is shared by the run. */
export const uniqueEmail = (prefix: string) => `${prefix}-${randomBytes(4).toString("hex")}@example.test`;

type CapturedFile = { to: string; kind: string; links: string[]; sentAt: string };

/** The newest link of this kind sent to this address, or undefined. */
async function newestLink(to: string, kind: string): Promise<string | undefined> {
  const files = await readdir(E2E_MAIL_DIR).catch(() => [] as string[]);
  const messages = await Promise.all(
    files
      .filter((file) => file.endsWith(`-${kind}.json`))
      .map(async (file) => JSON.parse(await readFile(path.join(E2E_MAIL_DIR, file), "utf8")) as CapturedFile),
  );
  return messages
    .filter((message) => message.to === to)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .at(-1)?.links[0];
}

/** Waits for a link of this kind sent to this address, other than `previous` (emails leave after the response). */
export async function waitForLink(to: string, kind: string, previous?: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      link = await newestLink(to, kind);
      return link !== undefined && link !== previous;
    }, { message: `${kind} email to ${to}` })
    .toBe(true);
  return link!;
}

/** Runs one SQL statement on the test database (to age a link, for instance). */
export async function sql(text: string, values: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

/** Ages every link of this purpose sent to this address, as if its lifetime had passed. */
export const expireLinks = (email: string, purpose: string) =>
  sql(
    `UPDATE auth_tokens SET expires_at = now() - interval '1 second'
     WHERE purpose = $2 AND user_id = (SELECT id FROM users WHERE email = $1)`,
    [email, purpose],
  );

/** Creates the administrator with the local script, as at setup (Q2); returns the link to choose the password. */
export async function createAdminWithScript(email: string): Promise<string> {
  const { stdout } = await promisify(execFile)(
    "npx",
    ["tsx", "--conditions=react-server", "scripts/create-admin.ts", "--email", email, "--first-name", "Ada", "--last-name", "Admin"],
    {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl(),
        BETTER_AUTH_URL: E2E_BASE_URL,
        EMAIL_TRANSPORT: "capture",
      },
    },
  );
  const link = stdout.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  if (!link) throw new Error(`No setup link printed by the script:\n${stdout}`);
  return link;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** A page of another role's space answers like a page that does not exist (AUTH-04 R3). */
export async function expectNotFound(page: Page, pathname: string) {
  const response = await page.goto(pathname);
  expect(response?.status(), pathname).toBe(404);
}

/**
 * A confirmed teacher, written straight to the test database: the invitation
 * journey has its own test (teacher.spec.ts). Returns the email.
 */
export const createTeacher = (firstName: string, lastName: string) => createAccount("teacher", firstName, lastName);

/** A confirmed student, written straight to the test database (sign-up has its own test). */
export const createStudent = (firstName: string, lastName: string) => createAccount("student", firstName, lastName);

async function createAccount(role: "teacher" | "student", firstName: string, lastName: string): Promise<string> {
  const email = uniqueEmail(role);
  const { hashPassword } = await import("better-auth/crypto");
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, email_verified, name, first_name, last_name, role)
       VALUES ($1, true, $2, $3, $4, $5) RETURNING id`,
      [email, `${firstName} ${lastName}`, firstName, lastName, role],
    );
    await client.query(
      `INSERT INTO accounts (user_id, provider_id, account_id, password) VALUES ($1, 'credential', $2, $3)`,
      [rows[0].id, rows[0].id, await hashPassword(PASSWORD)],
    );
  } finally {
    await client.end();
  }
  return email;
}
