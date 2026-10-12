import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_EXPIRES_IN,
  SESSION_UPDATE_AGE,
} from "@/config/provisional";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

// Better Auth handles sign-in, sign-out, database sessions and password hashing.
// No HTTP handler is mounted: the app calls auth.api.* from Server Actions only,
// so no Better Auth endpoint (sign-up, update-user…) is reachable by a request.
// Accounts and one-time links are written by src/server/data/auth/* (plan E1.0).
// Secret and base URL: BETTER_AUTH_SECRET and BETTER_AUTH_URL.

export const auth = betterAuth({
  appName: "Grading System",
  database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
  emailAndPassword: {
    enabled: true,
    // Without sendVerificationEmail, an unconfirmed account gets EMAIL_NOT_VERIFIED
    // and no Better Auth email: the app offers its own resend link (AUTH-02 R3).
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  user: {
    // Never taken from a request (input: false): written by the server only.
    additionalFields: {
      firstName: { type: "string", required: true, input: false },
      lastName: { type: "string", required: true, input: false },
      role: { type: "string", required: true, input: false },
    },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN,
    updateAge: SESSION_UPDATE_AGE,
    // Every request reads the session in the database: sign-out and the
    // revocation after a password reset take effect immediately (AUTH-02 R4).
    cookieCache: { enabled: false },
  },
  databaseHooks: {
    session: {
      create: {
        // Defence in depth: no session for an unconfirmed account, whatever the path.
        before: async (session) => {
          const [user] = await db
            .select({ emailVerified: schema.users.emailVerified })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId));
          return user?.emailVerified === true;
        },
      },
    },
  },
  advanced: {
    cookiePrefix: "grading",
    // Ids come from the database (uuid default gen_random_uuid()).
    database: { generateId: "uuid" },
  },
  telemetry: { enabled: false },
  // Must stay last: lets auth.api.* set cookies from Server Actions.
  plugins: [nextCookies()],
});
