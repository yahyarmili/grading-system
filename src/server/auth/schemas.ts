import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/provisional";
import { TOKEN_PATTERN } from "./tokens";

// Server-side validation of every auth input. z.object() drops unknown keys:
// a "role" or "emailVerified" sent with the form never reaches the data layer
// (AUTH-01 CA3).

/** Trimmed and lower-cased before any lookup, so " Sam@X.org" and "sam@x.org" are one account. */
export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter your email address." })
  .pipe(z.email({ error: "Enter a valid email address." }).max(254, { error: "Enter a valid email address." }));

export const passwordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` });

function nameSchema(label: string) {
  return z
    .string({ error: `Enter your ${label}.` })
    .trim()
    .min(1, { error: `Enter your ${label}.` })
    .max(100, { error: `Use at most 100 characters for your ${label}.` });
}

export const signUpSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  email: emailSchema,
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/** A malformed token is refused like an unknown one. */
export const tokenSchema = z.string().regex(TOKEN_PATTERN);
