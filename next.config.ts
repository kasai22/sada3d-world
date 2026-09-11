import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

import { securityHeaderRules, uploadOriginFromEnv } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  /*
   * No `X-Powered-By`. Naming the framework and CMS tells a scanner which
   * advisories to try first; Payload adds the header itself unless this is set.
   */
  poweredByHeader: false,

  /**
   * Security headers on every response. The policy and the reasoning behind
   * each directive are in `src/lib/security/headers.ts`. Payload appends its own
   * headers after these; it does not replace them.
   */
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
