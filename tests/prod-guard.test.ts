import { describe, expect, it } from "vitest";
import { databaseIdentity, planProdRun, PROD_SCRIPTS } from "../scripts/prod-guard";

// Spec 0012, AC-7: the wrapper that runs a script against production. Every
// URL here is fictitious; the assertions check that none is ever echoed.

const PROD = "postgresql://owner:prod-secret@ep-prod-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const DEV = "postgresql://owner:dev-secret@ep-dev-456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const TEST = "postgresql://owner:test-secret@ep-test-789.us-east-2.aws.neon.tech/neondb?sslmode=require";
const APP = "https://grading-system.vercel.app";
const env = { PRODUCTION_DATABASE_URL: PROD, PRODUCTION_APP_URL: APP, DATABASE_URL: DEV, DATABASE_URL_TEST: TEST };
const smtp = { SMTP_USER: "sender@example.test", SMTP_PASSWORD: "app-password" };

function refusal(argv: string[], values: Parameters<typeof planProdRun>[1]): string {
  const plan = planProdRun(argv, values);
  if (plan.ok) throw new Error("expected a refusal");
  for (const value of Object.values(values)) {
    if (value) expect(plan.error).not.toContain(value);
  }
  expect(plan.error).not.toMatch(/secret|neon\.tech|vercel\.app/);
  return plan.error;
}

describe("planProdRun", () => {
  it("allows exactly the four scripts", () => {
    expect(PROD_SCRIPTS).toEqual(["db:migrate", "admin:create", "ai:read", "ai:report"]);
    for (const script of ["db:migrate", "ai:read", "ai:report"]) {
      expect(planProdRun([script], env).ok).toBe(true);
    }
    expect(planProdRun(["admin:create"], { ...env, ...smtp }).ok).toBe(true);
  });

  it("maps the production variables and forwards the arguments", () => {
    const argv = ["admin:create", "--email", "admin@example.test", "--first-name", "Ada", "--last-name", "Admin"];
    expect(planProdRun(argv, { ...env, ...smtp })).toEqual({
      ok: true,
      script: "admin:create",
      args: argv.slice(1),
      env: { DATABASE_URL: PROD, BETTER_AUTH_URL: APP },
    });
  });

  it("refuses a script that is not allowed, or none", () => {
    expect(refusal(["db:generate"], env)).toContain("must be one of");
    expect(refusal(["ai:trial", "--provider", "anthropic"], env)).toContain("must be one of");
    expect(refusal([], env)).toContain("must be one of");
  });

  it("refuses when a production variable is missing, naming it only", () => {
    expect(refusal(["ai:read"], { ...env, PRODUCTION_DATABASE_URL: undefined })).toContain("PRODUCTION_DATABASE_URL is not set");
    expect(refusal(["ai:read"], { ...env, PRODUCTION_APP_URL: "" })).toContain("PRODUCTION_APP_URL is not set");
  });

  it("refuses a production URL that is not a Postgres URL", () => {
    expect(refusal(["ai:read"], { ...env, PRODUCTION_DATABASE_URL: "not a url" })).toContain("not a Postgres URL");
    expect(refusal(["ai:read"], { ...env, PRODUCTION_DATABASE_URL: "https://ep-prod-123.example.test/neondb" })).toContain(
      "not a Postgres URL",
    );
  });

  it("refuses the dev or the test database, however it is spelled", () => {
    // The direct endpoint of the dev database, another user and scheme, upper case, explicit port.
    const devDirect = "postgres://other:other-secret@EP-DEV-456.us-east-2.aws.neon.tech:5432/neondb";
    expect(refusal(["db:migrate"], { ...env, PRODUCTION_DATABASE_URL: devDirect })).toContain("same database as DATABASE_URL");
    const testPooled = "postgresql://owner:test-secret@ep-test-789-pooler.us-east-2.aws.neon.tech/neondb";
    expect(refusal(["db:migrate"], { ...env, PRODUCTION_DATABASE_URL: testPooled })).toContain(
      "same database as DATABASE_URL_TEST",
    );
  });

  it("accepts another database on the same host", () => {
    const sameHostOtherDb = "postgresql://owner:dev-secret@ep-dev-456.us-east-2.aws.neon.tech/production";
    expect(planProdRun(["ai:read"], { ...env, PRODUCTION_DATABASE_URL: sameHostOtherDb }).ok).toBe(true);
  });

  it("refuses admin:create without both SMTP variables, so the link is never printed", () => {
    expect(refusal(["admin:create"], env)).toContain("SMTP_USER and SMTP_PASSWORD");
    expect(refusal(["admin:create"], { ...env, SMTP_USER: smtp.SMTP_USER })).toContain("SMTP_USER and SMTP_PASSWORD");
  });
});

describe("databaseIdentity", () => {
  it("keeps host, port and database only", () => {
    expect(databaseIdentity(PROD)).toBe("ep-prod-123.us-east-2.aws.neon.tech:5432/neondb");
    expect(databaseIdentity(DEV)).toBe("ep-dev-456.us-east-2.aws.neon.tech:5432/neondb");
    expect(databaseIdentity("postgres://u:p@localhost:5433/app")).toBe("localhost:5433/app");
  });

  it("gives nothing for a URL without a database", () => {
    expect(databaseIdentity("postgres://u:p@localhost:5432")).toBeNull();
  });
});
