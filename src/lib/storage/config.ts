/**
 * Storage configuration.
 *
 * One place reads the R2 variables and one shape comes out of it. Nothing else
 * in the application reads `process.env.R2_*`, so there is one answer to "is
 * storage configured" and one list of what is missing.
 *
 * ── Server-only ──────────────────────────────────────────────────────────
 *
 * None of these variables is `NEXT_PUBLIC_`, so Next never inlines them into a
 * client bundle — a component that imported this module would read `undefined`
 * rather than a secret. The adapter that uses them also imports `node:crypto`
 * and the AWS SDK, neither of which builds for the browser.
 *
 * ── Reporting ────────────────────────────────────────────────────────────
 *
 * Problems are reported by variable *name*. A validation message that echoed a
 * value would put a secret access key in a deploy log.
 */

export interface R2Config {
  /** Cloudflare account id. Used to derive the endpoint when none is given. */
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** S3-compatible API origin, e.g. https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
}

export const R2_ENV = {
  accountId: "R2_ACCOUNT_ID",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
  bucket: "R2_BUCKET",
  endpoint: "R2_ENDPOINT",
} as const;

export type R2ConfigResult =
  | { status: "configured"; config: R2Config }
  /** Nothing set at all: storage is simply not part of this deployment yet. */
  | { status: "absent"; missing: readonly string[] }
  /** Partly set, or set to something unusable. Always an operator error. */
  | { status: "invalid"; problems: readonly string[] };

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** R2 bucket names: 3–63 characters, lowercase letters, digits and hyphens. */
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Cloudflare account ids are 32 hex characters. */
const ACCOUNT_PATTERN = /^[0-9a-f]{32}$/i;

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/**
 * Reads and validates the R2 configuration.
 *
 * `env` is injectable so the rules can be tested without touching the process
 * environment.
 */
export function readR2Config(env: Env = process.env): R2ConfigResult {
  const accountId = read(env, R2_ENV.accountId);
  const accessKeyId = read(env, R2_ENV.accessKeyId);
  const secretAccessKey = read(env, R2_ENV.secretAccessKey);
  const bucket = read(env, R2_ENV.bucket);
  const explicitEndpoint = read(env, R2_ENV.endpoint);

  const anySet = [accountId, accessKeyId, secretAccessKey, bucket, explicitEndpoint].some(
    (value) => value !== undefined,
  );

  const missing: string[] = [];
  if (!accessKeyId) missing.push(R2_ENV.accessKeyId);
  if (!secretAccessKey) missing.push(R2_ENV.secretAccessKey);
  if (!bucket) missing.push(R2_ENV.bucket);
  if (!explicitEndpoint && !accountId) {
    missing.push(`${R2_ENV.endpoint} (or ${R2_ENV.accountId})`);
  }

  if (!anySet) return { status: "absent", missing };

  const problems: string[] = missing.map((name) => `${name} is not set.`);

  if (accountId && !ACCOUNT_PATTERN.test(accountId)) {
    problems.push(`${R2_ENV.accountId} is not a 32-character Cloudflare account id.`);
  }

  if (bucket && !BUCKET_PATTERN.test(bucket)) {
    problems.push(
      `${R2_ENV.bucket} must be 3–63 lowercase letters, digits or hyphens.`,
    );
  }

  let endpoint: string | undefined;

  if (explicitEndpoint) {
    try {
      const url = new URL(explicitEndpoint);
      const production = env.NODE_ENV === "production";

      /*
       * HTTPS, always, with one exception: a loopback address outside
       * production, which is how the adapter's own tests reach a local stub.
       * A credential signed over plain HTTP to anywhere else is a credential
       * sent in the clear.
       */
      if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname) && !production)) {
        problems.push(`${R2_ENV.endpoint} must be an https:// URL.`);
      } else if (url.pathname !== "/" && url.pathname !== "") {
        problems.push(
          `${R2_ENV.endpoint} must be the API origin only, without the bucket or a path.`,
        );
      } else {
        endpoint = url.origin;
      }
    } catch {
      problems.push(`${R2_ENV.endpoint} is not a valid URL.`);
    }
  } else if (accountId && ACCOUNT_PATTERN.test(accountId)) {
    endpoint = `https://${accountId.toLowerCase()}.r2.cloudflarestorage.com`;
  }

  if (problems.length > 0 || !endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return { status: "invalid", problems };
  }

  return {
    status: "configured",
    config: {
      ...(accountId ? { accountId } : {}),
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint,
    },
  };
}
