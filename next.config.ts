import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { roleHome } from "./src/lib/roles";

// Docker Desktop on Windows mounts the project over 9p, which emits no file
// events: Turbopack must poll. Set only by compose.yaml, so a run outside
// Docker keeps native file watching.
const watchPollMs = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  // E9 (spec 0011): a native module, loaded from node_modules at run time, never bundled.
  serverExternalPackages: ["sharp"],
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

// Vercel Workflows (E6): compiles "use workflow" and "use step", and generates
// the flow route under src/app/.well-known/workflow/ (not committed).
export default withWorkflow(nextConfig);
