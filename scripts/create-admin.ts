// Creates the first administrator (Q2, provisional recommendation), outside any
// public screen. Run inside the container:
//   docker compose exec web npm run admin:create -- --email admin@example.org --first-name Ada --last-name Admin
// No password goes through the shell: the administrator receives a one-time
// link to choose it. Without SMTP variables, the link is printed here instead.
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { parseArgs } from "node:util";
import { z } from "zod";
import { PASSWORD_RESET_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import { emailSchema } from "@/server/auth/schemas";
import { appUrl } from "@/server/auth/urls";
import { createFirstAdmin } from "@/server/data/auth/invitations";
import { closeDatabase } from "@/server/data/lifecycle";
import { getEmailSender, selectTransport } from "@/server/email";
import { adminSetupMessage } from "@/server/email/templates";

const name = z.string().trim().min(1).max(100);
const argsSchema = z.object({ email: emailSchema, firstName: name, lastName: name });

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      "first-name": { type: "string" },
      "last-name": { type: "string" },
    },
  });
  const args = argsSchema.safeParse({
    email: values.email,
    firstName: values["first-name"],
    lastName: values["last-name"],
  });
  if (!args.success) {
    console.error("Usage: npm run admin:create -- --email <email> --first-name <first> --last-name <last>");
    return 1;
  }

  const result = await createFirstAdmin(args.data, PASSWORD_RESET_TTL);
  if (!result.ok) {
    console.error(
      result.reason === "admin_exists"
        ? "Refused: an administrator already exists (one administrator, A2)."
        : "Refused: this email already has an account (one account, one role).",
    );
    return 1;
  }

  const url = appUrl("/reset-password", { token: result.token });
  const validFor = formatDuration(PASSWORD_RESET_TTL);
  console.log(`Administrator created: ${args.data.email}`);
  if (selectTransport(process.env) === "smtp") {
    await getEmailSender().send(adminSetupMessage({ to: args.data.email, firstName: args.data.firstName }, url, validFor));
    console.log(`A link to choose the password was emailed. It works once and expires in ${validFor}.`);
  } else {
    // No email transport: the operator gets the one-time link directly.
    console.log(`No SMTP variables: open this link to choose the password (once, within ${validFor}):\n${url}`);
  }
  return 0;
}

main()
  .then(async (code) => {
    await closeDatabase();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closeDatabase();
    process.exit(1);
  });
