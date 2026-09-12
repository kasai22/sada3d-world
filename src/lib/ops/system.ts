import { readSupabaseAuthConfig } from "@/lib/auth/config";
import { checkReadiness } from "@/lib/api/readiness";
import { configuredConstraints } from "@/lib/manufacturing/manufacturability";
import { ANALYSIS_VERSION } from "@/lib/models/identity";
import { demoOrdersEnabled } from "@/lib/orders/fixtures";
import { storageStatus } from "@/lib/storage";

import type { OperatorSession } from "./operator";
import { paymentAdapterStatus, type PaymentAdapterStatus } from "./payments";

/**
 * What this deployment is connected to.
 *
 * Booleans, modes and the *names* of variables that are missing or malformed —
 * the same rule the public readiness endpoint follows, relaxed only to name the
 * variable, because an operator fixing a deployment needs to know which one.
 * No value, host, bucket, key or connection string is ever part of this.
 */

export interface SystemStatus {
  environment: "production" | "development";
  database: { reachable: boolean };
  storage: { configured: boolean; provider?: string; problems: string[] };
  customerAuth: { status: "configured" | "absent" | "invalid"; problems: string[] };
  payments: PaymentAdapterStatus;
  demoOrders: boolean;
  manufacturing: { constraints: "configured" | "unconfigured"; analysisVersion: string };
}

export async function getSystemStatus(_operator: OperatorSession): Promise<SystemStatus> {
  const readiness = await checkReadiness({ production: false });
  const storage = storageStatus();
  const auth = readSupabaseAuthConfig();

  return {
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    database: { reachable: readiness.checks.database },
    storage: storage.configured
      ? { configured: true, provider: storage.provider, problems: [] }
      : { configured: false, problems: [...storage.problems] },
    customerAuth:
      auth.status === "configured"
        ? { status: "configured", problems: [] }
        : auth.status === "absent"
          ? { status: "absent", problems: auth.missing.map((name) => `${name} is not set.`) }
          : { status: "invalid", problems: [...auth.problems] },
    payments: paymentAdapterStatus(),
    demoOrders: demoOrdersEnabled(),
    manufacturing: {
      constraints: configuredConstraints() ? "configured" : "unconfigured",
      analysisVersion: ANALYSIS_VERSION,
    },
  };
}
