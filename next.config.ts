import type { NextConfig } from "next";
import { roleHome } from "./src/lib/roles";

// Docker Desktop on Windows mounts the project over 9p, which emits no file
// events: Turbopack must poll. Set only by compose.yaml, so a run outside
// Docker keeps native file watching.
const watchPollMs = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  watchOptions: watchPollMs ? { pollIntervalMs: watchPollMs } : undefined,
  partialPrefetching: true,
  redirects() {
    return Object.entries(roleHome).map(([role, home]) => ({
      source: `/${role}`,
      destination: home,
      permanent: false,
    }));
  },
};

export default nextConfig;
