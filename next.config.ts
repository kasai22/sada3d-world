import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Payload wraps the Next config to register its admin bundle and server
 * externals. The storefront's own configuration is unchanged by it.
 */
export default withPayload(nextConfig);
