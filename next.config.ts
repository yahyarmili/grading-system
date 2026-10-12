import type { NextConfig } from "next";

// Docker Desktop on Windows mounts the project over 9p, which emits no file
// events: Turbopack must poll. Set only by compose.yaml, so a run outside
// Docker keeps native file watching.
const watchPollMs = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  watchOptions: watchPollMs ? { pollIntervalMs: watchPollMs } : undefined,
  partialPrefetching: true,
};

export default nextConfig;
