/**
 * Supabase Auth configuration.
 *
 * One place reads the Supabase variables, and one shape comes out. Nothing else
 * reads `process.env.NEXT_PUBLIC_SUPABASE_*`.
 *
 * ── Public by design, and used only on the server ────────────────────────
 *
 * The project URL and the anon key are public values in Supabase's model: the
 * anon key identifies the project and grants nothing an unauthenticated
 * visitor could not already do. They keep their `NEXT_PUBLIC_` names because
 * that is how Supabase projects and Vercel integrations name them.
 *
 * This application nonetheless never uses them in the browser. Every auth
 * operation runs on the server and the session lives in HttpOnly cookies, so
 * no client component reads these variables and Next never inlines them into a
 * browser bundle.
 *
 * ── The one thing checked that could be catastrophic ─────────────────────
 *
 * A service-role key pasted into the anon-key variable. It bypasses every row
 * level security policy in the database, and a variable named `NEXT_PUBLIC_`
 * is one refactor away from being shipped to every visitor. It is refused here,
 * by inspecting the key, and the application runs as though auth were not
 * configured rather than run with it.
 *
 * Problems are reported by variable name only.
 */

export const SUPABASE_ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
} as const;

export interface SupabaseAuthConfig {
  /** API origin, e.g. https://abcdefghijklmnop.supabase.co */
  url: string;
  anonKey: string;
}

export type SupabaseAuthConfigResult =
  | { status: "configured"; config: SupabaseAuthConfig }
  | { status: "absent"; missing: readonly string[] }
  | { status: "invalid"; problems: readonly string[] };

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** The `role` claim of a JWT-shaped key, without verifying it. Only used to refuse. */
function jwtRole(key: string): string | undefined {
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

export function readSupabaseAuthConfig(env: Env = process.env): SupabaseAuthConfigResult {
  const url = read(env, SUPABASE_ENV.url);
  const anonKey = read(env, SUPABASE_ENV.anonKey);

  if (!url && !anonKey) {
    return { status: "absent", missing: [SUPABASE_ENV.url, SUPABASE_ENV.anonKey] };
  }

  const problems: string[] = [];
  if (!url) problems.push(`${SUPABASE_ENV.url} is not set.`);
  if (!anonKey) problems.push(`${SUPABASE_ENV.anonKey} is not set.`);

  let origin: string | undefined;

  if (url) {
    try {
      const parsed = new URL(url);
      const production = env.NODE_ENV === "production";

      if (
        parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && isLoopback(parsed.hostname) && !production)
      ) {
        problems.push(`${SUPABASE_ENV.url} must be an https:// URL.`);
      } else if (parsed.pathname !== "/" && parsed.pathname !== "") {
        problems.push(`${SUPABASE_ENV.url} must be the project origin, without a path.`);
      } else {
        origin = parsed.origin;
      }
    } catch {
      problems.push(`${SUPABASE_ENV.url} is not a valid URL.`);
    }
  }

  if (anonKey) {
    if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
      problems.push(
        `${SUPABASE_ENV.anonKey} holds a service-role (secret) key. It must be the public anon key; the secret key must never be in a public variable.`,
      );
    }
  }

  if (problems.length > 0 || !origin || !anonKey) {
    return { status: "invalid", problems };
  }

  return { status: "configured", config: { url: origin, anonKey } };
}

export function supabaseAuthConfigured(env: Env = process.env): boolean {
  return readSupabaseAuthConfig(env).status === "configured";
}

/* ------------------------------------------------------------------ *
 * Session cookies
 * ------------------------------------------------------------------ */

/**
 * Whether a cookie holds (part of) a Supabase session.
 *
 * `@supabase/ssr` stores the session as `sb-<project-ref>-auth-token`, split
 * into `.0`, `.1`, … chunks when large. The PKCE code-verifier cookie is not a
 * session and does not match.
 */
export function isSessionCookieName(name: string): boolean {
  return /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/.test(name);
}

/** Every cookie Supabase Auth writes, including the code verifier. */
export function isAuthCookieName(name: string): boolean {
  return /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+|-code-verifier)?$/.test(name);
}

/**
 * A small, non-secret, browser-readable marker that a session exists.
 *
 * It exists for one purpose: the header can say "Account" or "Sign in"
 * without every page in the site becoming dynamic. It is written by the server
 * beside the real session and is **never** read for any decision — a forged
 * value changes a link label and nothing else.
 */
export const SESSION_HINT_COOKIE = "sada3d_session";

export interface CookieAttributes {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
}

/**
 * The attributes every session cookie is written with, whatever the SDK asked
 * for: HttpOnly, so no script on the page — including an injected one — can
 * read a token; SameSite=Lax, so a cross-site form post does not carry it;
 * Secure in production; scoped to the whole site.
 */
export function hardenSessionCookie<T extends CookieAttributes>(options: T): T {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export const SESSION_HINT_OPTIONS: CookieAttributes = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/* ------------------------------------------------------------------ *
 * Provider timeouts
 * ------------------------------------------------------------------ */

/**
 * How long one call to Supabase Auth may take before it is abandoned.
 *
 * supabase-js sets no timeout of its own. A provider that accepts a connection
 * and never answers would hold the request — and, through the proxy, every
 * navigation of a signed-in customer — until the platform killed the function.
 * Eight seconds is long past a healthy auth round trip and well inside a
 * function's lifetime.
 */
export const AUTH_REQUEST_TIMEOUT_MS = 8_000;

/**
 * `fetch`, abandoned after `AUTH_REQUEST_TIMEOUT_MS`.
 *
 * Passed to every Supabase client as `global.fetch`. A caller's own abort
 * signal still works; whichever fires first wins. An abandoned call fails as a
 * network error inside the SDK, which the adapter reports as the provider being
 * unavailable rather than as an invalid session. The session cookies are kept:
 * a slow provider costs that one request its signed-in state and signs nobody
 * out.
 */
export const authFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
