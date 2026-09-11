# Customer authentication — Supabase Auth

Supabase Auth says **who** a customer is. The account, order, design and cart
services still decide **what** that customer may touch — exactly as they did
before there was a provider.

```
Browser ──(credentials, over this origin)──► server action / route handler
                                                   │
                                                   ▼
                                      Supabase Auth (lib/auth/supabase.ts)
                                                   │  session → HttpOnly cookies
                                                   ▼
proxy.ts ── refreshes tokens before rendering      │
                                                   ▼
                     CustomerAuthAdapter (lib/account/identity.ts)
                                                   │  getUser() validates the token
                                                   ▼
                customers table: (supabase, auth user id) → cus_…
                                                   │
                                                   ▼
             CustomerIdentity { id: "cus_…" }  →  requireCustomerContext()
                                                   │
                                                   ▼
     account · orders · designs/R2 · cart · checkout  — ownership decided here
```

## Decisions

**Sessions are server-side and HttpOnly.** Every auth operation is a server
action or route handler, and `@supabase/ssr` writes the session as cookies with
HttpOnly forced on (`hardenSessionCookie`). No script on the page — including
an injected one — can read an access or refresh token. The browser Supabase
client is therefore not used for authentication at all; the anon key is only
read on the server.

**`getUser()`, not `getSession()`.** A cookie is something the browser holds.
Identity comes from asking Supabase to validate the token, so a signed-out,
revoked or deleted-user session stops working immediately. It is called at most
once per request (React `cache`), and not at all when there is no session cookie.

**The proxy refreshes; it does not authorize.** `src/proxy.ts` refreshes an
expiring session before a page renders (a Server Component cannot write
cookies). It never redirects signed-out visitors and never decides access —
every page, action and API route resolves the customer itself.

**Provider id ≠ customer id.** `customers(auth_provider, auth_subject)` is unique;
provisioning is `INSERT … ON CONFLICT DO NOTHING` then `SELECT`, so repeated and
concurrent first sign-ins resolve to one `cus_…` id. Ownership columns hold the
customer id, so a later provider can map onto the same customers.

**No service-role key.** Nothing needs one. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is
inspected, and a service-role/secret key in it disables auth with a logged error.

**The development identity** exists only when no Supabase variable is set and
the build is not production. Any Supabase variable — even a broken one — turns
it off, so a typo cannot sign everyone in as the development customer.

## Identity mapping

| Supabase | Application |
| --- | --- |
| `auth.users.id` | `customers.auth_subject` (with `auth_provider = 'supabase'`) |
| — | `customers.id` → `CustomerIdentity.id` → every `customer_id` column |
| `user.email` | `CustomerProfile.email`, read per request, never stored |
| `user.email_confirmed_at` | `CustomerProfile.emailVerified`, read per request, never set |

No name, email or verification flag is copied into the database.

## Flows

| Flow | Path | Notes |
| --- | --- | --- |
| Sign in | `/login` → `signInAction` | wrong email and wrong password are one answer; `email_not_confirmed` is said honestly |
| Sign up | `/login?mode=signup` → `signUpAction` | with confirmation on: no session, no customer until the link is followed; an existing address gets the same answer |
| Confirm | email → `/auth/confirm?token_hash=…&type=signup` | establishes the session, merges the guest cart, 303 to the validated return path |
| Forgot password | `/login?mode=forgot` → `requestPasswordResetAction` | same message for every address |
| Recover | email → `/auth/confirm?…type=recovery` → `/login/reset-password` | the page checks the session exists before showing the form |
| Change password | `/login/reset-password` while signed in | |
| Sign out | `SignOutButton` → `signOutAction` | revokes at the provider, deletes cookies in a `finally`, revalidates every page |
| Session expired | any account page | "Your session has expired" rather than a bare sign-in |

Return paths go through `safeReturnPath`: `/account/**`, `/custom-print`,
`/cart`, `/checkout` — nothing else. Email links are built from
`NEXT_PUBLIC_SITE_URL`, never the request's Host header.

## Routes

| Route | Class | Enforcement |
| --- | --- | --- |
| `/account`, `/account/*` | Owner | every page calls `requireCustomerContext`; services are scoped by customer |
| address and saved-item server actions | Owner | identity resolved in the action; ids looked up within the customer's own rows |
| `GET /api/orders` | Authenticated | 401 without a session; lists the customer's own |
| `GET /api/orders/[ref]`, `/tracking` | Owner or guest grant | not-yours and not-found are the same 404 |
| `POST /api/orders/[ref]/events` | Owner or guest grant | same-origin check, then the order state machine decides |
| `/api/designs/*` | Owner | 401 without a session; 404 for anything not the customer's; same-origin on POST/DELETE |
| `POST /api/checkout`, checkout action | Public (guest checkout) | same-origin; identity attaches ownership; custom parts need the customer's verified design |
| `POST /api/quotes`, `/api/models/analyze`, `/api/custom-print/analyze` | Public | store nothing, read no customer data |
| `/auth/confirm` | Public | link tokens only; redirect destinations are constants or allowlisted |
| `/admin`, `/payload-api/*` | Operator | Payload's own authentication; customers have no access |

## Carts

A guest's cart stays in its HttpOnly cookie. A signed-in customer's cart is the
`customer_carts` row, the same on every device. At sign-in, sign-up with a
session, and a confirmation or recovery link, the guest cart is merged
(`lib/cart/merge.ts`):

- same product and configuration → one line, quantities summed and clamped;
- anything else → its own line, after the account's lines;
- merged custom lines are flagged `quote_stale` and must be re-quoted;
- custom lines whose file is only in a browser, or whose design is not the
  customer's verified design, are kept and blocked at checkout;
- every price is re-read from the catalog when the cart is priced;
- lines beyond the 40-line limit stay in the guest cart;
- a guest cart id is merged once, however many times sign-in runs.

## Supabase project configuration

1. **Authentication → Providers → Email**: enabled. Choose whether *Confirm
   email* is on; the application handles both honestly.
2. **Authentication → URL Configuration**:
   - Site URL: the production origin, e.g. `https://sada3d.in`
   - Redirect URLs: `https://sada3d.in/auth/confirm`,
     `http://localhost:3000/auth/confirm`, and each preview origin you test
     sign-up or recovery from.
3. **Authentication → Email Templates** — so links work in any browser, not only
   the one that started the flow, point them at the confirmation route with the
   token hash:
   - Confirm signup:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
   - Reset password:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

   The default `{{ .ConfirmationURL }}` also works, through the PKCE code
   exchange, but only in the browser that requested the email.
4. **Authentication → Rate Limits**: keep the defaults or tighten them. The
   application adds its own per-address and per-source limits on top.
5. **SMTP**: Supabase's built-in mailer is heavily rate-limited and intended for
   testing. Configure a real SMTP provider before launch.

## Environment

| Variable | Local | Vercel (Preview + Production) |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | required for real accounts | required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required for real accounts | required |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | the deployment's public origin |
| `DATABASE_URL` | required | required (customers, carts) |

Apply the migration: `npm run db:migrate` (`0003_customer_identity`).

## Verification

`npm test` runs the adapter against a stand-in for Supabase Auth and the
provisioning, isolation and merge rules against PostgreSQL. It proves what this
code does with Supabase's responses, not that the project behaves that way.

Against the real project:

```
npm run auth:verify
AUTH_VERIFY_A_EMAIL=… AUTH_VERIFY_A_PASSWORD=… \
AUTH_VERIFY_B_EMAIL=… AUTH_VERIFY_B_PASSWORD=… npm run auth:verify
```

Then, in a real browser, with two accounts:

1. Sign up (A) → the page says to check email → follow the link → lands signed
   in on `/account`.
2. Sign out → `/account` shows sign-in; `/api/designs/…` answers 401.
3. Sign in (A) in a second tab → the first tab's header updates.
4. Forgot password → link → `/login/reset-password` → change it → old password
   refused, new one works.
5. As A: upload a design on `/custom-print`, add to cart, check out.
6. As B (another browser): `/account/orders/<A's ref>` shows not found;
   `/api/designs/<A's design>/file` answers 404; A's addresses and saved parts
   are absent.
7. Add to cart while signed out, then sign in → the lines join the account cart.
8. Leave a tab idle past the session lifetime, or delete the user in the
   dashboard → the next account page says the session expired.
9. In the browser's devtools: the `sb-…-auth-token` cookies are HttpOnly, and no
   JavaScript bundle contains the anon key or any server secret.
