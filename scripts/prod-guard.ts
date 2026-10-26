// The rules of `npm run prod` (spec 0012, AC-7), apart from the process that
// applies them so they can be tested. Every message names a variable or a
// script, never a value: the production address must never be printed.

/** The only scripts allowed against production: never ai:read, the handwriting trial calls the AI (trials stay on dev). */
export const PROD_SCRIPTS = ["db:migrate", "admin:create", "ai:report", "ai:status"] as const;

export type ProdScript = (typeof PROD_SCRIPTS)[number];

/** Reads PRODUCTION_DATABASE_URL, PRODUCTION_APP_URL, DATABASE_URL, DATABASE_URL_TEST, SMTP_USER, SMTP_PASSWORD. */
type ProdEnv = Record<string, string | undefined>;

export type ProdPlan =
  | { ok: true; script: ProdScript; args: string[]; env: { DATABASE_URL: string; BETTER_AUTH_URL: string } }
  | { ok: false; error: string };

/**
 * Host, port and database of a Postgres URL, or null when it does not parse.
 * Neon names the pooled endpoint `<endpoint>-pooler.<region>…` and the direct
 * one `<endpoint>.<region>…`: both reach the same database, so the suffix is
 * dropped before comparing.
 */
export function databaseIdentity(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
  const [endpoint, ...rest] = parsed.hostname.toLowerCase().split(".");
  const host = [endpoint.replace(/-pooler$/, ""), ...rest].join(".");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!host || !database) return null;
  return `${host}:${parsed.port || "5432"}/${database}`;
}

/** Decides whether `npm run prod -- <script> [args…]` may run, and with which environment. */
export function planProdRun(argv: string[], env: ProdEnv): ProdPlan {
  const [script, ...args] = argv;
  if (!script || !(PROD_SCRIPTS as readonly string[]).includes(script)) {
    return { ok: false, error: `Refused: the script must be one of ${PROD_SCRIPTS.join(", ")}.` };
  }
  const { PRODUCTION_DATABASE_URL: databaseUrl, PRODUCTION_APP_URL: appUrl } = env;
  if (!databaseUrl) return { ok: false, error: "Refused: PRODUCTION_DATABASE_URL is not set." };
  if (!appUrl) return { ok: false, error: "Refused: PRODUCTION_APP_URL is not set." };

  const production = databaseIdentity(databaseUrl);
  if (!production) return { ok: false, error: "Refused: PRODUCTION_DATABASE_URL is not a Postgres URL." };
  for (const name of ["DATABASE_URL", "DATABASE_URL_TEST"] as const) {
    const other = env[name];
    if (other && databaseIdentity(other) === production) {
      return { ok: false, error: `Refused: PRODUCTION_DATABASE_URL names the same database as ${name}.` };
    }
  }

  // The one time setup link is always emailed, never printed (create-admin.ts prints it without SMTP).
  if (script === "admin:create" && !(env.SMTP_USER && env.SMTP_PASSWORD)) {
    return { ok: false, error: "Refused: admin:create needs SMTP_USER and SMTP_PASSWORD, so the link is emailed." };
  }

  return { ok: true, script: script as ProdScript, args, env: { DATABASE_URL: databaseUrl, BETTER_AUTH_URL: appUrl } };
}
