# Durable design storage — Cloudflare R2

Customer manufacturing files live in a **private** Cloudflare R2 bucket. The
database holds what is known about each file; the bucket holds the bytes. No
customer file is ever stored in PostgreSQL, on a server's disk, or in memory
between requests.

```
Browser
  │  1. selects a file · inspects its head · computes SHA-256
  │
  ├─► POST /api/designs/upload-intents        { fileName, sizeBytes, sha256 }
  │      server: identity from the auth adapter · validates name, type, size
  │      writes customer_designs row  (PENDING, server-generated key)
  │      signs one PUT for that key   (10 min, type + length signed)
  │
  ├─► PUT  <signed URL>  ───────────────────────────────────────► R2
  │      real transfer progress (XHR upload events)
  │
  ├─► POST /api/designs/{id}/upload-complete
  │      server: HEAD (exists, size) · GET into a bounded buffer
  │      SHA-256 == declared · format signature from the bytes
  │      mesh formats: parse + geometry analysis from the stored bytes
  │      geometry_analyses row (sha256, analysis version)
  │      customer_designs → VERIFIED
  │
  ├─► Quote → Cart (design facts taken from the verified row)
  │
  └─► Checkout
         every custom line: owned · verified · analysed · HEAD confirms the object
         order_items.source_* snapshot (key, sha256, name, size, format, analysis, configuration)
         → Order → manufacturing job
```

## Why direct-to-R2 and not through the server

A Vercel function accepts **at most 4.5 MB** of request body, and a manufacturing
file may be **200 MB**. A server-mediated upload is therefore not an option on
the deployment platform, whatever its other merits. The browser uploads to R2
with a short-lived presigned PUT, and the server stays authoritative by:

- generating the object key. The browser never sends one and no response
  carries one as a field; the only place a key appears is the path of the
  browser's own signed upload URL, which authorises that single PUT and nothing
  else;
- signing the `Content-Type` and `Content-Length`, so R2 refuses a different
  type or size;
- expiring the URL after ten minutes;
- re-reading the stored object and comparing it with what was declared before
  anything depends on it.

Downloads follow the same rule in reverse: `GET /api/designs/{id}/file` checks
ownership and state, confirms the object exists, and redirects to a signed GET
valid for two minutes. The bytes never pass through a function.

## The storage contract

`types.ts` is the whole interface. Nothing outside `lib/storage` imports the
AWS SDK, and nothing outside `r2.ts` constructs a command or reads an SDK
response.

```ts
interface StorageAdapter {
  readonly name: string;
  put(request: { key; body: Uint8Array; contentType }): Promise<StorageObject>;
  head(key: string): Promise<StorageObject | null>;       // null = no such object
  get(key: string): Promise<StorageReadable | null>;      // stream + metadata
  delete(key: string): Promise<void>;                     // idempotent
  signUpload(request: { key; contentType; size; expiresInSeconds }): Promise<SignedUpload>;
  signDownload(request: { key; fileName; contentType?; expiresInSeconds }): Promise<SignedDownload>;
}
```

Failures are `StorageError` with a `kind` of `not_configured`, `denied`,
`unavailable` or `invalid_request`. Messages name the operation and the
provider's error code — never a key, an endpoint, a URL or a credential.

There is **no fallback adapter**. Without R2 configuration, uploads answer 503,
the account says designs cannot be stored, and checkout refuses custom parts.
The in-memory adapter in `memory.testing.ts` is for tests and nothing imports it
at runtime.

## Object keys

```
customer-designs/{sha256(customerId)[0:32]}/{dsn_<96 random bits>}/{obj_<96 random bits>}/source
```

- The customer id is hashed, so the key does not identify the customer and a
  hostile id cannot become a path segment.
- A fresh object id per upload intent means no upload can overwrite another —
  not another customer's and not an earlier upload of the same design.
- The filename is not part of the key. It is sanitised (`keys.ts`) and stored
  as display metadata only.
- `keyBelongsTo` is checked before any stored key is used, so a row altered to
  point into another namespace is refused.

## Lifecycle

| State | Meaning | Object |
| --- | --- | --- |
| `pending` | upload target issued | may or may not exist yet |
| `verified` | server re-read it and it matched | exists; orderable |
| `failed` | refused, or abandoned | removed |
| `deleted` | retired by the customer | removed after 1 h grace, never while an order references it |

The row is written **before** the upload URL exists, so an object can never be
in the bucket without a record naming it. Every failure ordering converges:

| What happened | What is left | What resolves it |
| --- | --- | --- |
| signing failed after the row was written | pending row, no object | sweep marks it abandoned |
| browser never uploaded / never finalised | pending row, maybe an object | sweep marks it abandoned, removes the object |
| storage or DB failed during finalise | pending row + object | retrying finalise (idempotent) |
| verification refused the file | failed row | object removed; removal recorded once the URL expired |
| removal failed | failed/deleted row, `object_removed_at` null | next sweep retries |
| object vanished after verification | verified row | checkout HEADs the object and refuses; download 404s |
| design deleted after ordering | deleted row | order keeps its snapshot; sweep never removes an object an order names |

`npm run storage:sweep` runs the reconciliation on demand; the upload-intents
route also runs a bounded sweep after responding.

## Environment

| Variable | Local dev | Vercel (preview/prod) | Notes |
| --- | --- | --- | --- |
| `R2_ACCOUNT_ID` | required¹ | required¹ | 32 hex characters |
| `R2_ACCESS_KEY_ID` | required | required | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | required | required, **Sensitive** | never logged, never sent to a browser |
| `R2_BUCKET` | required | required | private bucket name |
| `R2_ENDPOINT` | optional¹ | optional¹ | `https://<account>.r2.cloudflarestorage.com`, or the `.eu.` jurisdiction endpoint |
| `DATABASE_URL` | required | required | designs are rows; no database, no designs |

¹ One of `R2_ENDPOINT` or `R2_ACCOUNT_ID` is required.

None of these is `NEXT_PUBLIC_`, so Next never inlines them into a client
bundle. A partial configuration is reported at use time by variable **name**.

## Setting up R2

1. **Create the bucket.** Cloudflare dashboard → R2 → Create bucket, e.g.
   `sada3d-designs`. Leave *Public access* **disabled** and attach **no** custom
   domain. The application never needs a public URL.
2. **Create credentials.** R2 → Manage API tokens → Create API token.
   Permission: **Object Read & Write**. Scope: **this bucket only**. Not *Admin*.
   Copy the Access Key ID and Secret Access Key — the secret is shown once.
3. **Least privilege.** One token per environment (development, preview,
   production), each scoped to its own bucket, so a leaked development key cannot
   read production files. Set a TTL on development tokens.
4. **Endpoint.** R2 → bucket → Settings → S3 API:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Set `R2_ACCOUNT_ID`, or set
   `R2_ENDPOINT` directly (required for an EU-jurisdiction bucket).

   The dashboard shows the S3 API URL **with the bucket name appended**
   (`…r2.cloudflarestorage.com/<bucket>`). `R2_ENDPOINT` must be the origin
   only: the adapter uses path-style addressing and adds the bucket itself, and
   the configuration refuses an endpoint with a path. The bucket goes in
   `R2_BUCKET` (not `R2_BUCKET_NAME`). Both mistakes were made, and caught, when
   the real bucket was connected in Stage 19.
5. **CORS.** The browser PUTs to R2 and the 3D viewer GETs from it, so the
   bucket needs a CORS policy for the site's origins (bucket → Settings → CORS):

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["etag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add each Vercel preview domain you test uploads from.

   Origins are compared **exactly**: no trailing slash
   (`https://example.com`, not `https://example.com/` — the production origin was
   first entered with one and every preflight from it got 403), and
   `http://localhost:3000` is not `http://127.0.0.1:3000`. Nothing in the
   application needs `HEAD`, `DELETE` or `POST`, or any request header other
   than `content-type`: in Chrome the upload sends a preflighted `PUT`, and the
   viewer and downloads send a plain `GET` (verified in Stage 19, see
   `SECURITY.md`).
6. **Vercel.** Project → Settings → Environment Variables: add the four `R2_*`
   variables for Production and Preview (mark the secret *Sensitive*), then
   redeploy.
7. **Local.** Put the same variables in `.env.local` (git-ignored). See
   `.env.example` for the names.
8. **Migrate.** `npm run db:migrate` applies `0002_design_storage`.
9. **Verify against the real bucket.**

   ```
   npm run storage:verify
   npm run storage:verify -- --file ./path/to/part.3mf --origin http://localhost:3000
   ```

   This checks, against R2 itself: credentials and bucket, PUT, HEAD, GET
   checksum, missing-object handling, a signed PUT, **refusal of a wrong length,
   a wrong content type and an expired signature**, a signed GET with the
   attachment override, CORS for the origin, a real model analysed from storage,
   and DELETE. It writes only under `verification/` and cleans up.
10. **Verify the product flow.** Signed in (development identity locally), upload
    a 3MF on `/custom-print`: the stage shows *Uploading* with real progress,
    then *Verifying and analysing*, then *Stored for manufacturing*. Reload — the
    model is still viewable. It appears in `/account/designs` with Download and
    Delete. Add to cart, and checkout accepts it.
11. **Verify refusal.** From a second identity (or with `SADA_DEV_ACCOUNT=0`),
    `GET /api/designs/<id>/file` for the first customer's design answers 404,
    exactly as a design id that does not exist.

## What the tests do and do not prove

`storage.test.ts` runs the R2 adapter against a local S3-shaped HTTP stub and
proves request shape, signing, error mapping and secret hygiene.
`design-storage.test.ts` runs the whole lifecycle against PostgreSQL and a
storage double that enforces signature constraints and can fail on demand.

Neither proves that Cloudflare R2 behaves as the double does. Only
`npm run storage:verify` against a real bucket does, and a report that R2 was
verified must come from running it.
