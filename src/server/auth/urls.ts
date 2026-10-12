/** Absolute link for emails, from BETTER_AUTH_URL (the application's own address). */
export function appUrl(path: string, params?: Record<string, string>): string {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("BETTER_AUTH_URL is not set");
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
}
