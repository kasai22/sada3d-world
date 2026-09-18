import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

import { LEGACY_REDIRECTS } from "./src/lib/ops/routes";
import { securityHeaderRules, uploadOriginFromEnv } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  /*
   * No `X-Powered-By`. Naming the framework and CMS tells a scanner which
   * advisories to try first; Payload adds the header itself unless this is set.
   */
  poweredByHeader: false,

  /*
   * Opt-in cap on build workers. Unset, Next.js picks the count (cores − 1).
   * A machine near its memory commit limit can set NEXT_BUILD_WORKERS=2 so
   * static generation does not start more workers than it can hold.
   */
  /*
   * Opt-in low-memory mode for `next dev` (NEXT_LOW_MEMORY=1, e.g. in the
   * git-ignored .env.local). On a machine near its memory commit limit, Windows
   * refuses Turbopack's memory-mapped reads ("os error 1450: insufficient system
   * resources") and the dev server panics in a loop. This turns off the
   * persistent dev cache (.next/dev/cache) and dev source maps, which are the
   * memory-mapped work. Production builds are unaffected.
   */
  experimental: {
    ...(Number(process.env.NEXT_BUILD_WORKERS) > 0 ? { cpus: Math.floor(Number(process.env.NEXT_BUILD_WORKERS)) } : {}),
    ...(process.env.NEXT_LOW_MEMORY === "1" && process.env.NODE_ENV !== "production"
      ? { turbopackFileSystemCacheForDev: false, turbopackSourceMaps: false }
      : {}),
  },

  /**
   * Security headers on every response. The policy and the reasoning behind
   * each directive are in `src/lib/security/headers.ts`. Payload appends its own
   * headers after these; it does not replace them.
   */
  /**
   * Stage 22.5: `/admin` is Reality 3D Admin and Payload's own admin moved to
   * `/cms`. The Stage 21 `/ops` console and Payload's old `/admin/…` deep links
   * redirect to their new homes (`LEGACY_REDIRECTS`). Temporary redirects carry
   * nothing; every destination requires a signed-in operator itself.
   */
  async redirects() {
    return LEGACY_REDIRECTS.map((rule) => ({ ...rule, permanent: false }));
  },

  async headers() {
    return securityHeaderRules({
      production: process.env.NODE_ENV === "production",
      uploadOrigin: uploadOriginFromEnv(),
    });
  },
};

/**
 * Payload wraps the Next config to register its admin bundle and server
 * externals. The storefront's own configuration is unchanged by it.
 */
export default withPayload(nextConfig);
