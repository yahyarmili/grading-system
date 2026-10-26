// Which deployment this is (spec 0012). Vercel sets VERCEL_ENV on its builds
// and functions: "production" for main, "preview" for preview; absent locally,
// in tests and on the E2E server.

/** True on the Vercel Production deployment only. */
export function isProductionDeployment(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV === "production";
}
