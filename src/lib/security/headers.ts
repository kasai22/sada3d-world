import { readR2Config } from "../storage/config";

/**
 * Security headers, for every response Next.js serves.
 *
 * Built here as plain data and installed by `next.config.ts`. Imported
 * relatively, because the config file is loaded before the `@/` alias exists.
 *
 * ── The Content Security Policy, and why it is this one ──────────────────
 *
 * Next.js offers two shapes (docs: guides/content-security-policy):
 *
 *   nonces       every page rendered per request, so a fresh nonce can be
 *                stamped on each script. Static pages, ISR and CDN caching of
 *                HTML all stop.
 *   no nonces    `'unsafe-inline'` for scripts and styles, set once here, and
 *                every page keeps the rendering it has.
 *
 * This is the second, deliberately. The catalog, product and content pages are
 * cached; making every one of them dynamic to remove `'unsafe-inline'` would
 * trade a measured performance property for a defence against inline-script
 * injection — and React already escapes every value it renders, and the one
 * `dangerouslySetInnerHTML` in the application (the product page's JSON-LD) is
 * written through `serializeJsonForScript`, so catalog text cannot close its
 * script element. What the policy still does, and what matters most:
 *
 *   script-src       no third-party origin can supply a script
 *   connect-src      a script that did run can only talk to this origin and the
 *                    storage endpoint uploads go to — not to an attacker's host
 *   object-src       no plugins
 *   base-uri         a <base> tag cannot re-point relative URLs
 *   form-action      a form cannot post credentials elsewhere
 *   frame-ancestors  no other site can frame this one (clickjacking)
 *
 * `'unsafe-eval'` is added in development only, where React needs it for
 * readable server error stacks. It is never in the production policy.
 *
 * ── Where it is not applied ──────────────────────────────────────────────
 *
 * `/admin` and `/payload-api` belong to Payload, whose admin bundle is not ours
 * to constrain and has its own authentication. They still get every other
 * header below.
 *
 * ── HSTS ─────────────────────────────────────────────────────────────────
 *
 * Production only, one year, without `includeSubDomains` or `preload`: those
 * reach beyond this deployment to every subdomain of whatever domain it is
 * served on, which is a decision for whoever owns the domain, not this file.
 */

export interface SecurityHeaderOptions {
  production: boolean;
  /**
   * The origin browsers upload model files to, with a signed URL. The exact R2
   * endpoint when it is known; otherwise any R2 endpoint.
   */
  uploadOrigin?: string;
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/** Any Cloudflare R2 S3 endpoint, jurisdiction subdomains included. */
export const R2_UPLOAD_WILDCARD = "https://*.r2.cloudflarestorage.com";

/** Path prefixes owned by Payload, where the CSP is not applied. */
export const CSP_EXCLUDED_PREFIXES = ["admin", "payload-api"] as const;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The exact R2 endpoint when storage is configured, or the R2 wildcard.
 *
 * `next.config.ts` headers are fixed when the server starts (and at build on
 * Vercel), so a deployment whose R2 variables are set gets the narrow origin.
 * One without them has no uploads to allow, and the wildcard is only ever as
 * wide as R2.
 */
export function uploadOriginFromEnv(env: Env = process.env): string {
  const result = readR2Config(env);
  return result.status === "configured" ? result.config.endpoint : R2_UPLOAD_WILDCARD;
}

export function contentSecurityPolicy({
  production,
  uploadOrigin = R2_UPLOAD_WILDCARD,
}: SecurityHeaderOptions): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"])],
    ["style-src", "'self'", "'unsafe-inline'"],
    // `blob:` and `data:` are the viewer drawing a file this tab already holds.
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'"],
    [
      "connect-src",
      "'self'",
      "blob:",
      "data:",
      uploadOrigin,
      // The development server's hot-reload socket.
      ...(production ? [] : ["ws:", "wss:"]),
    ],
    ["worker-src", "'self'", "blob:"],
    ["media-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];

  return directives.map((directive) => directive.join(" ")).join("; ");
}

export function baseSecurityHeaders({ production }: SecurityHeaderOptions): HeaderEntry[] {
  return [
    // A response is what its Content-Type says, never what a browser guesses.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Other sites learn this origin, never a path — paths carry order references.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // `frame-ancestors` for browsers that predate it.
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    // A window this site opens cannot reach back into it, nor it into them.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
      : []),
  ];
}

/**
 * Paths whose responses must send no Referer onward.
 *
 *   /api/designs/:id/file   a redirect whose Location is a signed R2 URL
 *   /auth/confirm           a redirect from a URL that carries the email token
 *
 * Their handlers set `Referrer-Policy: no-referrer` themselves, but a
 * `next.config.ts` header for the same key replaces the value a handler sets —
 * found in Stage 19, where the download redirect arrived with the site default.
 * So the policy is restated here, after the base rule: for the same path and
 * key, the last matching rule wins.
 */
export const NO_REFERRER_PATHS = ["/api/designs/:id/file", "/auth/confirm"] as const;

/** The `headers()` rules for `next.config.ts`. */
export function securityHeaderRules(
  options: SecurityHeaderOptions,
): { source: string; headers: HeaderEntry[] }[] {
  return [
    { source: "/:path*", headers: baseSecurityHeaders(options) },
    ...NO_REFERRER_PATHS.map((source) => ({
      source,
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    })),
    {
      source: `/:path((?!${CSP_EXCLUDED_PREFIXES.join("|")}).*)`,
      headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy(options) }],
    },
  ];
}
