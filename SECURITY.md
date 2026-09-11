# SADA 3D — Security and Performance Model

The rules this application holds, where each is enforced, the limits it runs
within, and — as plainly — what has **not** been verified against real
infrastructure. Written for Stage 18; every claim names the file that makes it
true.

> **Verification status.** Everything below was built and tested locally:
> unit, integration (PostgreSQL via PGlite), stress and boundary tests, a
> typecheck, lint, a production build, a client-bundle scan and a local
> production-server smoke test. Since Stage 19, **Cloudflare R2 has been
> exercised against the real bucket**, including the upload, viewer and download
> flow in a real Chrome browser from `http://localhost:3000`. **Supabase Auth and
> Vercel have not been exercised.** See
> [Stage 19](#stage-19--cloudflare-r2-connected) and
> [Verification](#verification).

---

## 1. Trust boundaries

| Source | Trusted for | Never trusted for |
| --- | --- | --- |
| Browser (any request, form, server action argument, cookie value) | Nothing but a claim to be checked | Identity, price, total, owner, storage key, geometry, file type, return URL |
| Supabase Auth | *Who* the caller is (`getUser()`, validated server-side per request) | What they may do — authorization is the application's |
| PostgreSQL | Orders, designs, customers, reservations, analyses (after validation) | A cached analysis is re-validated before use (`lib/models/analysis-store.ts`) |
| Cloudflare R2 | Holding bytes, in a private bucket | The file's type, size or content — re-read and verified by the server |
| Payload CMS content | Catalog text for rendering | Raw HTML: JSON-LD is escaped (`lib/security/serialize.ts`) |
| Payload operators | Content | Customer data — operators and customers are separate identity systems |

Principles that follow from the table:

- **Identity is resolved on the server, every time.** No route, action or query
  accepts a customer id from a request (`lib/account/identity.ts`,
  `lib/api/orders.ts`).
- **Ownership is checked where data is read,** not by a proxy or a layout.
  `proxy.ts` refreshes sessions and authorizes nothing.
- **Not found and not yours are one answer** — a 404 — for orders and designs.
- **Fail closed.** No grant without a cookie scope; no storage without R2; no
  in-memory database in production.

## 2. Routes and what protects them

| Route | Access | Additional protection |
| --- | --- | --- |
| Pages under `/shop`, `/`, `/custom-print` | Public | Static or cached; no customer data |
| `POST /api/quotes` | Public | JSON ≤ 32 KB, unknown fields refused, rate limit `quote.source` |
| `POST /api/models/analyze`, `/api/custom-print/analyze` | Public | Body ≤ 4 MB + framing (413), rate limit `model.analysis.source`, model limits |
| `GET /api/health`, `GET /api/ready` | Public | Booleans only, `no-store`; readiness rate-limited |
| `/orders/[reference]`, `GET /api/orders/[reference]`, `…/tracking` | Account owner, or guest grant | Reference format checked; 404 for missing or not-yours |
| `POST /api/orders/[reference]/events` | Account owner, or guest grant | Same-origin; body is a command vocabulary (`cancel`), unknown fields refused |
| Order lookup (server action) | Anyone with reference **and** email | 5 wrong emails per reference / 10 min; `order.lookup.source` per connection |
| `/account/*`, `GET /api/orders` | Signed-in customer | Rendered dynamically; `private, no-store` |
| `/api/designs/*` | Signed-in owner | Same-origin on mutations; per-customer rate limits; signed URLs short-lived |
| `POST /api/checkout`, checkout action | Anyone with a cart | Same-origin (API) / Next action origin check; `checkout.source`; server-side pricing; idempotency |
| Cart, saved-item, address actions | Cart: anyone; others: signed-in | Arguments projected and type-checked (`lib/api/action-input.ts`) |
| `/auth/confirm` | Anyone holding a valid emailed link | Rate limit `auth.email_link.source` checked before any token is verified (a refusal is a `429` and leaves the link usable); `no-store`, `Referrer-Policy: no-referrer`, safe return paths |
| `/admin`, `/payload-api/*` | Payload operators | Payload auth; lockout after 5 failures for 15 min; unlock is admin-only |

**Same-origin enforcement** (`assertSameOrigin`, `lib/api/respond.ts`) is on every
state-changing API route: `POST /api/checkout`, `POST /api/designs/upload-intents`,
`POST /api/designs/[id]/upload-complete`, `DELETE /api/designs/[id]` and
`POST /api/orders/[reference]/events`. Server actions rely on Next.js's built-in
Origin/Host comparison. All session cookies are `SameSite=Lax`, which already
keeps them off cross-site POSTs; the origin check is the second layer. No route
sends CORS headers, so no other origin can read a response.

## 3. Input handling

- **Bodies.** JSON is read with a byte limit (default 32 KB) enforced *while
  reading* — a declared `Content-Length` over the limit is refused unread, and a
  chunked body is cut off at the limit (`readJson`, `readBoundedBytes`). Over the
  limit is `413`; invalid UTF-8 or JSON is `400`.
- **Unknown fields.** API routes refuse them by name (`rejectUnknownFields`), at
  every level. Server actions project onto an allowlist instead, so an extra
  field never reaches a service and existing forms keep working.
- **Numbers.** Finite, integral where required, and within a stated range before
  any engine sees them; `NaN`, `Infinity`, numeric strings and `1e308` are
  refused, never coerced.
- **Order references** must be `S3D-` + 6–10 digits (or a `DEMO-` fixture);
  anything else is a 404 without a lookup, and never enters the lookup throttle
  (`lib/orders/reference.ts`).
- **Return paths** after sign-in are an allowlist of site paths; absolute,
  protocol-relative, backslash, control-character, dot-segment and
  percent-encoded `.` `/` `\` forms are refused (`lib/account/routes.ts`).

## 4. Model files and geometry

Every layer refuses on its own terms, cheapest first.

| Layer | Limit | Where |
| --- | --- | --- |
| Upload size | 200 MB (direct to R2, signed length) | `lib/custom-print/types.ts` |
| Inline analysis body | 4 MB (Vercel caps function bodies at 4.5 MB) | `MAX_INLINE_ANALYSIS_BYTES` |
| File type | Extension **and** content signature must agree | `lib/storage` inspection |
| ZIP (3MF) | 512 entries; 128 MB per entry; 256 MB total; ratio ≤ 1000 above 4 MB; safe entry names only | `lib/models/zip.ts` |
| XML | `DOCTYPE` refused (no entity expansion); 4 M elements | `lib/models/xml.ts` |
| Triangles (after expansion) | 2,000,000 | `MODEL_LIMITS` |
| Vertices | 4,000,000 | `MODEL_LIMITS` |
| 3MF objects / build items | 10,000 / 10,000 | `MODEL_LIMITS` |
| 3MF placements | 100,000 | `MODEL_LIMITS` |
| 3MF component depth | 16 (also stops cycles) | `MODEL_LIMITS` |

Counts are checked **before** the memory they protect is allocated, and a model
over a limit fails with `ModelTooComplexError` (422, recorded as
`model_too_complex`) — never a partial result.

**Files larger than 4 MB never pass through a function.** They are uploaded to R2
with a signed URL and analysed from storage. The browser does not attempt inline
analysis above 4 MB.

### Measured analysis cost

Binary STL, closed tessellated mesh, Node 24, peak RSS from
`process.resourceUsage()`, **including the file held in memory**. Local machine;
not a Vercel function.

| Triangles | File | Before Stage 18 | After |
| --- | --- | --- | --- |
| 250,000 | ~12 MB | 3.7 s · 632 MB | 0.30 s · 97 MB |
| 500,000 | ~24 MB | 7.7 s · 922 MB | 0.65 s · 136 MB |
| 1,000,000 | ~48 MB | 16.3 s · ~2 GB | 1.2 s · 216 MB |
| 2,000,000 (limit) | ~95 MB | 32 s · 2.7 GB | 2.4 s · 374 MB |
| 4,000,000 | ~190 MB | — | 5.3 s · 691 MB *(refused in production by the triangle limit)* |

Read against file sizes: a 50 MB STL is about 1 M triangles (~216 MB), a 100 MB
STL about 2 M (~374 MB), and a 200 MB STL about 4 M — which is **refused** by
`maxTriangles` before analysis. The upload limit is 200 MB; **accepting a 200 MB
upload is not a claim that analysing one is production-safe**, which is why the
triangle limit exists. Real function memory and duration on Vercel are **NOT
VERIFIED**. A 3MF can be smaller on disk than its geometry; the triangle and
placement limits, not the file size, bound its cost.

## 5. Rate limits

In-process, fixed window, **per server instance**. Across serverless instances
each counts independently, so the effective ceiling is the limit × warm
instances. This is **not** a distributed rate limiter and does not defend
against a distributed attack. Limits that must hold globally are enforced in
the database (uploads in flight) or by Supabase Auth itself.

| Rule | Limit | Window | Subject |
| --- | --- | --- | --- |
| `design.upload_intent` | 20 | 10 min | customer |
| `design.upload_complete` | 40 | 10 min | customer |
| `design.read` | 120 | 1 min | customer |
| `design.download` | 60 | 1 min | customer |
| `design.delete` | 30 | 10 min | customer |
| `auth.sign_in.account` | 10 | 10 min | hashed email |
| `auth.sign_in.source` | 40 | 10 min | hashed source |
| `auth.sign_up.source` | 10 | 1 h | hashed source |
| `auth.password_reset.account` | 3 | 15 min | hashed email |
| `auth.password_reset.source` | 10 | 15 min | hashed source |
| `auth.password_update` | 10 | 10 min | customer |
| `auth.email_link.source` | 30 | 10 min | hashed source |
| `model.analysis.source` | 20 | 10 min | hashed source |
| `quote.source` | 120 | 1 min | hashed source |
| `checkout.source` | 20 | 10 min | hashed source |
| `order.lookup.source` | 30 | 10 min | hashed source |
| `app.readiness.source` | 60 | 1 min | hashed source |

Anonymous subjects are SHA-256 hashed; the limiter never holds an email or an IP
and never logs one. **Memory is bounded**: at 10,000 tracked subjects the map is
swept to 9,000 — expired windows first, then the oldest. Sweeping to a low-water
mark rather than making room for one entry matters: the first version rescanned
the whole map on every new subject once full, and a flood of 200,000 fresh
sources took 31.6 s; it now takes ~0.1 s (`src/lib/stress/stress.stress.ts`). The
order-lookup throttle has the same bound and the same fix. Eviction fails open
for the evicted subjects rather than locking everyone out.

The source is the first `X-Forwarded-For` entry, which Vercel sets. On a host
that does not, a client can vary it — spreading its own attempts across
buckets, while per-account limits still hold.

## 6. Sessions and cookies

| Cookie | Purpose | HttpOnly | SameSite | Secure | Lifetime |
| --- | --- | --- | --- | --- | --- |
| `sb-<ref>-auth-token` (and `.0`, `.1` chunks) | Supabase session | Yes (forced) | Lax | Production | Supabase-managed |
| `sb-<ref>-auth-token-code-verifier` | PKCE verifier for email links | Yes (forced) | Lax | Production | Short |
| `sada3d_session` | "Signed in" hint for the header link. **Never read for a decision.** | No | Lax | Production | 30 days |
| `sada3d_cart` | Guest cart lines (re-priced and re-validated on every load) | Yes | Lax | Production | 30 days |
| `sada3d_cart_count` | Header badge count only | No | Lax | Production | 30 days |
| `sada3d_order` | Receipt: the reference of the order this browser placed | Yes | Lax | Production | 1 hour |
| `sada3d_order_access` | Lookup grants: up to 20 references proved with an email | Yes | Lax | Production | 1 day |
| `payload-token` | Payload operator session | Yes (Payload) | Lax | Production | 2 hours |

Supabase cookies are written through `hardenSessionCookie`
(`lib/auth/config.ts`), which forces HttpOnly, Lax, Secure-in-production and
path `/` whatever the SDK requested — the browser Supabase client is never used
for authentication. Every Supabase call has an 8-second timeout (`authFetch`).
A timed-out call is logged as the provider being unavailable
(`auth.provider.unavailable`), not as an invalid session: the session cookies
and the header hint are left in place, so nobody is signed out. That one
request is served as not signed in; the next succeeds once the provider
answers. The proxy's `getClaims()` only sets the header hint; the server
validates with `getUser()` before any decision.

## 7. Security headers

Set in `next.config.ts` from `src/lib/security/headers.ts`, on every response:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | See below. Not on `/admin` or `/payload-api` (Payload's own bundle). |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (`no-referrer` on auth links and downloads) |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=31536000` — production only, without `includeSubDomains`/`preload` |
| `X-Powered-By` | Not sent (`poweredByHeader: false`) |

Production CSP:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data: <R2 endpoint>;
worker-src 'self' blob:; media-src 'self' blob:; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**Why `'unsafe-inline'` and not nonces.** A nonce-based CSP forces every page to
render per request (Next.js CSP guide), ending static rendering and CDN caching
of the catalog. The chosen policy still blocks every third-party script origin,
restricts where an injected script could send data (this origin and the R2
upload endpoint), forbids plugins, `<base>` hijacking, off-site form posts and
framing. React escapes rendered values, and the one `dangerouslySetInnerHTML` —
product JSON-LD — is escaped so CMS text cannot close its `<script>`. `'unsafe-eval'`
appears only in development. The R2 connect origin is the exact configured
endpoint, or `https://*.r2.cloudflarestorage.com` when storage is not configured.

## 8. Errors

| Status | Meaning | Example |
| --- | --- | --- |
| 400 | Malformed or invalid input | wrong type, unknown field, bad JSON |
| 401 | Sign-in required | `GET /api/orders` signed out |
| 403 | Refused | cross-origin state change |
| 404 | Not found **or not yours** | someone else's order or design; malformed reference |
| 409 | Conflict with current state | cart changed, duplicate checkout, disallowed transition |
| 413 | Body too large | JSON over 32 KB; inline model over 4 MB |
| 422 | Understood, cannot be done | unquotable configuration; model too complex; rejected upload |
| 429 | Rate limited | carries `Retry-After` |
| 500 | Unexpected | one generic sentence |
| 503 | A dependency failed | database unreachable or timed out; storage unavailable; payment unavailable |

`failure()` (`lib/api/respond.ts`) answers unexpected errors with one sentence
and logs `api.request.failed` with **only** the error's name, its code and a
classification. It never logs the message: a Drizzle error's message contains
the SQL and its parameters — customer emails and addresses. Database connection
failures (codes `08*`, `57P0*`, `53*`, `ECONNREFUSED`, timeouts, found through
the `cause` chain) and `StorageError`s become 503. Every error response is
`Cache-Control: private, no-store`.

## 9. Caching

| What | Rule |
| --- | --- |
| Catalog and homepage content | `unstable_cache`, tags `sada3d:catalog` / `sada3d:homepage`; invalidated on publish with `expire: 0` (`payload/revalidate.ts`) |
| Customer data (account, orders, designs, cart, checkout) | Never in a shared cache: dynamic rendering, API responses `private, no-store`, nothing customer-specific in `unstable_cache` |
| Auth responses, confirmation links | `no-store` (Supabase SSR headers passed through by the proxy) |
| Design downloads | Short-lived signed URL, `private, no-store`, `no-referrer` |
| Geometry analyses | PostgreSQL, keyed by (sha256, analyser version); **validated on read** — identity must match the hash, every number finite, objects consistent — and a corrupt row is deleted and re-analysed |
| Health and readiness | `no-store` |

## 10. Database and resilience

- **Queries.** A customer's orders are read by `orders_customer_placed_idx`, with
  items, shipments, jobs and events read for the whole list in a fixed number
  of queries (`listOrdersForCustomer`, `findJobsForOrders`). Before Stage 18
  every account page read every order and every manufacturing event in the
  system. `IN` lists are chunked at 1,000 values.
- **Timeouts.** Application pool: 10 s to connect, 15 s per query (client-side
  `query_timeout`; `statement_timeout` is refused by transaction poolers).
  Payload pool: 10 s to connect, no query timeout (migrations run through it).
  Supabase: 8 s per call.
- **Checkout.** The idempotency key is marked complete the moment the order is
  written; linking designs, creating manufacturing jobs and clearing the cart
  follow and are all idempotent, so a retry after a partial failure returns the
  same order and finishes it instead of starting a second payment. If writing
  the order fails after payment, the reservation is **kept** (so a retry cannot
  charge again) and `checkout.failed` is logged with the reference for
  reconciliation.
- **State machine.** Manufacturing events are applied under a row lock per job,
  and event ids are primary keys — duplicate delivery is one transition
  (Phase 15, `orders/persistence.test.ts`).

## 11. Health and readiness

- `GET /api/health` — the process answers. Touches no dependency.
- `GET /api/ready` — `{ ready, checks: { database, storage, auth } }`, 200 or
  503. Database: configured and `SELECT 1` within 3 s. Storage and auth:
  configuration present and well-formed (not reachability — probing R2 on every
  check would spend billed operations). Production requires all three;
  development requires only the database.

## 12. Observability

Structured JSON lines (`lib/observability.ts`); scalar fields only. Stage 18
events: `api.request.failed`, `api.request.too_large`,
`api.rate_limiter.saturated`, `app.readiness.failed`,
`model.analysis.cache_rejected`, `checkout.failed`. Never logged: request
bodies, file bytes, filenames, emails, names, addresses, phone numbers, tokens,
signed URLs, storage keys, payment session ids, error messages from drivers or
providers.

## 13. Client bundle

- `src/lib/security/boundary.test.ts` walks the import graph of every
  `"use client"` module and fails if it reaches a database driver, a storage,
  auth or Payload SDK, `next/headers`, or a server-only environment variable.
  It found two client components importing through a barrel that also exported
  server components; they now import directly.
- The production build's `.next/static` was scanned: no non-public `.env`
  value, no server SDK, no connection string, no secret variable name.
  84 JS files, 3.64 MB total, largest chunk ~1 MB (the 3D viewer).

## 14. Dependencies

No major versions were changed. Payload moved 3.88.0 → **3.89.0** (all
`@payloadcms/*` aligned; installed with `--legacy-peer-deps` because
`@payloadcms/db-postgres@3.89.0` pins an exact `payload` peer).

| Package | Version |
| --- | --- |
| next | 16.3.4 |
| react / react-dom | 19.2.8 |
| payload, @payloadcms/next, @payloadcms/db-postgres | 3.89.0 |
| @supabase/ssr | 0.12.7 |
| @supabase/supabase-js | 2.116.0 |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | 3.1129.0 |
| drizzle-orm | 0.45.2 *(transitive — see below)* |
| pg | 8.20.0 *(transitive — see below)* |
| three | 0.185.1 |
| typescript | 5.9.3 |

**`npm audit`: 5 moderate, 0 high, 0 critical.** All five are one advisory —
esbuild's development server (GHSA-67mh-4wv8-2f99) — reached only through
`drizzle-kit` inside `@payloadcms/db-postgres`. It affects a development server
that this application does not run in production. No fix is available without
changing Payload's major dependency chain.

**Undeclared dependencies.** The application imports `drizzle-orm` and `pg`
directly, but `package.json` does not declare them; they resolve because
Payload's Postgres adapter installs them. A Payload upgrade can therefore change
the ORM and driver underneath the application. Recommended: declare both at
their current versions. Not changed in this stage, to avoid re-resolving the
lockfile under `--legacy-peer-deps`.

## 15. Tests

| File | Covers |
| --- | --- |
| `src/lib/api/hardening.test.ts` | Body limits, unknown fields, safe error logging, 503 mapping, limiter bound and eviction, return paths, references, lookup bound, readiness shape |
| `src/lib/security/headers.test.ts` | CSP directives, dev vs production, HSTS, upload origin, path exclusions |
| `src/lib/security/boundary.test.ts` | Client import graph |
| `src/lib/security/serialize.test.ts` | JSON-LD script escaping |
| `src/lib/checkout/input.test.ts` | Checkout input: strict and lenient, types, lengths |
| `src/lib/models/limits.test.ts` | Triangle and vertex limits (binary STL, ASCII STL, OBJ), inline limit, cached-analysis validation |
| `src/lib/geometry/analyze.test.ts` | New analyser equals the previous one on edge cases and random meshes |
| `src/lib/security/url.test.ts` | Malformed percent-encoding refused before routing |
| `src/lib/stress/stress.stress.ts` — **`npm run test:stress`** | 1,005 orders across the `IN`-list chunk, cache self-repair, concurrent saves, limiter burst and flood, quote burst, 250k-triangle analysis |

**The stress tests are a separate command.** Every PGlite suite reserves a large
WebAssembly heap and `node --test` runs files in parallel. With the stress file
included, `npm test` intermittently failed at file level with
`Fatal process out of memory: Zone` — a failure to *commit* memory (14.5 GB of
RAM was free, 5.5 GB of commit charge was not). It is the sixth and heaviest
PGlite suite, so it runs as `npm run test:stress` and the default suite carries
the same database load it did before Stage 18. For the same reason, run either
command without `next build` or `next start` alive (`src/lib/db/README.md`).

In Stage 19 the default suite alone hit the same failure on this machine, which
has no page file: 5.2 GB of its 31.8 GB commit limit was free, with Figma,
Chrome and VS Code holding most of the rest. Run one file at a time, it passed
506/506:

```
node --import tsx --test --test-concurrency=1 "src/**/*.test.ts"
```

## Stage 19 — Cloudflare R2, connected

Verified against the real bucket on 2026-09-11, from a local machine. Every
result below was produced by running it; anything that was not run is marked.

### Configuration

| | |
| --- | --- |
| Bucket | `sada3dworld` |
| Endpoint | `https://<account>.r2.cloudflarestorage.com` — default jurisdiction, path-style |
| Variables | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` — the names the code already used |
| Where | `.env`, git-ignored. None is `NEXT_PUBLIC_`. |

Two local configuration errors were corrected, with no application code change:
the bucket was in `R2_BUCKET_NAME` instead of `R2_BUCKET`, and `R2_ENDPOINT` had
the bucket appended (as the Cloudflare dashboard displays the S3 API URL), which
the existing validator refuses. Either one made storage report *invalid*.

### Results

| Check | Result | How |
| --- | --- | --- |
| Credentials and bucket access | PASS | server-side PUT (`npm run storage:verify`) |
| Write, HEAD, read (SHA-256 match) | PASS | `storage:verify` |
| Missing object | PASS | HEAD and GET answer null |
| Delete, and delete again | PASS | `storage:verify`; a listing afterwards found 0 objects in the bucket |
| Signed PUT refuses a wrong length, a wrong type, an expired signature | PASS — HTTP 403 each | `storage:verify` |
| Signed PUT scope | PASS | writes its own key only (another key: 403, that object unchanged); cannot GET or DELETE; `X-Amz-Expires=600`; signs `content-length;content-type;host` |
| Signed GET scope | PASS | reads its own key only; cannot PUT or DELETE; expiry cannot be extended (403); `X-Amz-Expires=120`; served as an attachment |
| Unsigned access | PASS | GET, bucket listing and PUT without a signature: HTTP 400 |
| A real model analysed from R2 | PASS | `precision-gear.stl` stored, re-read and analysed (`storage:verify --file`) |
| Large-file workflow over HTTP | PASS | 23.8 MB closed STL (499,392 triangles): inline route 413; intent 201; direct PUT to R2 200 in 26.4 s; upload-complete verified and analysed from R2 in 5.2 s (closed, 100 mm); repeat finalise and repeat intent idempotent; owner download 302 → identical bytes |
| Authorization | PASS | second customer: read, download, finalise and delete → 404 (service layer, the functions the routes call); owner's design unchanged; same bytes → a separate design in that customer's own key namespace; cross-site DELETE 403; unknown id and a storage key used as an id 404; an intent naming a key 400 |
| Deletion lifecycle | PASS | owner DELETE 200 → file 404 at once → bytes kept for the grace period → the application's sweep removed them from R2 |
| R2 failures → HTTP | PASS | with a wrong secret and with an unreachable endpoint: upload-complete and download answer `503` "File storage is temporarily unavailable", `no-store`, no redirect, no provider code, bucket, host or key id; the adapter maps them to `denied` and `unavailable` |
| Client secret exposure | PASS | production `.next/static`: no non-public `.env` value (including the R2 key id, secret, account id, bucket and endpoint), no `R2_*` names, no S3 client, presigner or SigV4 code; the built CSP `connect-src` is exactly the R2 endpoint |
| Browser uploads (CORS) | PASS — from `http://localhost:3000` | a bucket CORS policy was added in the dashboard after the first pass; verified in Chrome — see [Browser verification](#browser-verification-chrome) |
| Public access, r2.dev, custom domain | **NOT VERIFIED** | not visible through the S3 API. Unsigned requests to the S3 endpoint are refused, but the bucket's public-access setting has to be confirmed in the dashboard |
| A real browser session | PASS — Chrome 152, local | upload, preflight, direct PUT, finalise, analysis, 3D viewer from R2 and download through the normal UI — see [Browser verification](#browser-verification-chrome) |
| Vercel | **NOT VERIFIED** | not deployed |

### Found and fixed

- **The download and email-link redirects had lost `Referrer-Policy: no-referrer`**
  — a Stage 18 regression. A `next.config.ts` header for the same key replaces
  the value a route handler sets, so the site default
  `strict-origin-when-cross-origin` was sent on `/api/designs/[id]/file`, whose
  `Location` is a signed URL, and on `/auth/confirm`, whose own URL carries the
  email token and whose redirect is same-origin — so the full token URL would
  have gone onward as the Referer. The policy is now restated for those paths
  after the base rule (`NO_REFERRER_PATHS` in `src/lib/security/headers.ts`),
  covered by a test, and confirmed live: the download 302 carries
  `no-referrer` and `private, no-store`.

### Observations, not changed

- **The access key id appears in every signed URL** (`X-Amz-Credential`), as
  SigV4 presigning requires. It is not the secret, and it reaches only the
  customer the URL was issued to. The secret never leaves the server.
- **A HEAD in a bucket the token cannot use answers as a missing object**: a HEAD
  response has no body to carry `NoSuchBucket`. With a wrong but valid
  `R2_BUCKET`, finalising would say the upload has not arrived rather than
  answer 503. `npm run storage:verify` fails loudly on that configuration — its
  first step is a PUT.
- **Readiness reports `storage: true` while R2 is failing**: it checks
  configuration, not reachability (§11).
- **Test residue**: the development database keeps the Stage 19 test designs as
  deleted and failed records, and one content-keyed geometry analysis. R2 holds
  no test objects.

### Browser verification (Chrome)

Run on 2026-09-11 in Google Chrome 152 — headed, with a throwaway profile,
driven by `playwright-core` installed outside the repository — against
`next dev` at `http://localhost:3000`. The network was recorded through the
Chrome DevTools Protocol, the same data the DevTools Network panel shows,
including preflights and the headers actually sent and received. The account was
the **development identity**: no Supabase project is configured, so a real
sign-in was not possible.

| Step | Result | Observed |
| --- | --- | --- |
| Upload a real STL through `/custom-print` | PASS | the `precision-gear` part (576 triangles, 28.2 KB, header changed per run so every run uploads); "Stored for manufacturing and verified." 3.8 s after selecting the file |
| Signed upload URL | PASS | `POST /api/designs/upload-intents` → 201, sent with `Origin: http://localhost:3000`, response `private, no-store` |
| Preflight | PASS | `OPTIONS` → 204. Sent `Origin: http://localhost:3000`, `Access-Control-Request-Method: PUT`, `Access-Control-Request-Headers: content-type`. Received `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Methods: PUT, GET`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 3600` |
| Direct PUT to R2 | PASS | XHR `PUT` → 200 with `Content-Type: model/stl`; response `Access-Control-Allow-Origin: http://localhost:3000`, exposes `ETag` |
| Finalise, and analysis from R2 | PASS | `upload-complete` → 200; the UI shows 49.9 × 49.9 × 8.0 mm, 576 triangles, 10.70 cm³, closed and watertight |
| 3D viewer from R2 | PASS | after a reload, when the tab no longer holds the file: `GET /api/designs/[id]/file` → 302 (`Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`) → CORS `GET` of the signed URL → 200 with `Access-Control-Allow-Origin: http://localhost:3000`; the viewer reached its ready state and rendered the part |
| Download | PASS | the Download link on `/account/designs` → 302 → signed `GET` (attachment) → bytes identical to the upload (SHA-256) |
| Methods actually used | — | the browser sent only `OPTIONS`, `PUT` and `GET` to R2 and no `HEAD` anywhere, and requested only the `content-type` header |
| Unsigned direct requests | PASS | an unsigned `GET` and `PUT` of the uploaded object: HTTP 400 from R2, and blocked in the page |
| Credentials in the browser | PASS | 145 requests, 132 response bodies and 86 client scripts contain no R2 secret, Payload secret or database URL or password. The R2 access key id appears only inside signed URLs, as SigV4 requires |
| CORS failures | none from the application | the only two were the deliberate unsigned probes above |
| Authorization | PASS | a second customer's read, download, finalise and delete → 404; the owner's delete → file 404 → the sweep removed the object from R2 |

**The CORS policy, as verified** (bucket `sada3dworld`, one rule):

| | |
| --- | --- |
| Origins | `http://localhost:3000`, `https://sada3d-world.vercel.app` |
| Methods | `PUT`, `GET` |
| Headers | `Content-Type` |
| Expose | `ETag` |
| Max age | 3600 s |

These are exactly the methods and header the browser used, and nothing more.

**Corrected in Stage 19.** The Vercel origin had been entered as
`https://sada3d-world.vercel.app/`. Browsers send an origin without a trailing
slash and R2 compares origins exactly, so a preflight from the production site
got 403. The slash was removed through the S3 API with every other value
unchanged. Re-probed: the Vercel origin gets 204, while the slashed form, other
origins, `HEAD` and `DELETE` get 403. Uploads from a page actually served by the
Vercel site were **not** exercised: it is not deployed.

**Not verified in the browser:** a real Supabase sign-in; the Vercel origin from
a real page; Vercel preview domains, which are not in the policy, so uploads from
a preview deployment will be refused until they are added; and the dashboard's
public-access setting (r2.dev, custom domains).

**Environment notes.** With Chrome running beside the development server, the
server's route workers crashed out of memory five times (this machine has no page
file and about 5 GB of commit headroom). The run above used a freshly started
server whose routes were warmed first, and recorded no crashes. The test designs
were retired and swept afterwards, and the bucket was left with 0 objects.

## Verification

| Item | Status | Evidence |
| --- | --- | --- |
| Unit and integration tests | PASS (local) | `npm test` |
| Stress and concurrency tests | PASS (local) | `npm run test:stress` |
| Typecheck | PASS | `tsc --noEmit` |
| Lint | PASS | `eslint` |
| Production build | PASS | `next build` |
| Client bundle scan | PASS | `.next/static` scan (§13) |
| Security headers on a running server | PASS (local `next start`) | CSP without `unsafe-eval` on pages and API routes; none on `/admin`; HSTS, `DENY`, `nosniff`, referrer, permissions, COOP present; no `X-Powered-By` |
| Request hardening on a running server | PASS (local `next start`) | Quote: valid 200, unknown field 400 (named), `1e400` 400, 40 KB 413. Inline model: 284-byte STL 200, 5 MB STL 413 ×3. Malformed escapes 400; unknown reference 404; signed-out orders and designs 401; cross-site checkout and order events 403; checkout unknown field 400; error bodies carry no stack |
| Product JSON-LD | PASS (local `next start`) | Renders and parses as JSON |
| Readiness in production mode | PASS (local `next start`) | `503` with `database: true, storage: false, auth: false` — correct: production requires all three |
| Payload 3.89 schema drift | PASS | `payload migrate:create --skip-empty` generated no migration against the committed snapshot |
| Cloudflare R2 — real bucket: credentials, write, read, delete, signed URLs, large-file workflow, authorization, failures, no client exposure | PASS (local, real bucket) | [Stage 19](#stage-19--cloudflare-r2-connected) |
| Cloudflare R2 — browser upload, viewer and download (Chrome, `http://localhost:3000`) | PASS (local, real bucket) | [Browser verification](#browser-verification-chrome) |
| Cloudflare R2 — browser uploads from the Vercel origin | **NOT VERIFIED** | Not deployed; the CORS preflight for that origin answers 204 |
| Supabase Auth (real project, two identities, email links) | **BLOCKED** | No Supabase project configured; `npm run auth:verify` not run |
| Vercel (4.5 MB body limit, function memory and duration, `X-Forwarded-For`) | **NOT VERIFIED** | Not deployed |
| Analysis memory on Vercel | **NOT VERIFIED** | Local measurements only (§4) |
| Distributed rate limiting | **NOT IMPLEMENTED** | Per-instance by design (§5) |
| CSP against the live site in a browser (viewer, uploads, admin) | **NOT VERIFIED** | Headers checked by test and `curl`, not a browser session |

## Known limitations

- Rate limits are per instance (§5).
- `'unsafe-inline'` remains in the CSP by design (§7).
- HSTS does not cover subdomains.
- Readiness checks R2 and Supabase configuration, not reachability.
- A payment taken whose order then fails to write needs manual reconciliation
  from the `checkout.failed` log line; there is no automated refund path because
  no live payment provider exists yet.
- `drizzle-orm` and `pg` are transitive, undeclared dependencies (§14).
- A malformed percent-escape under `/admin` or `/payload-api` still gets the
  framework's bare `500` (no stack, no detail). The proxy refuses malformed
  paths with a `400` everywhere else, but its matcher deliberately excludes
  Payload's routes so customer-session code never runs on operator requests.
- The PGlite suites are memory-hungry: stress tests run as their own command,
  and neither command should run beside a Next.js build or server (§15).
- The bucket CORS policy allows exactly `http://localhost:3000` and
  `https://sada3d-world.vercel.app`. Origins are compared exactly, so Vercel
  preview deployments (and `127.0.0.1`) cannot upload until they are added
  (Stage 19).
- The R2 access key id is visible inside signed URLs, as presigning requires;
  the secret is not (Stage 19).
