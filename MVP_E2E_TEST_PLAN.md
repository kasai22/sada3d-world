# SADA3D Critical E2E Test Plan

Use isolated test users, seeded orders/designs, and non-production payment/email modes. Every scenario must record browser console errors, failed requests, screenshots on failure, and desktop (1440), tablet (768), and mobile (390) evidence.

## Release-blocking scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| S-01 | Crawl all header/footer/home links | No internal 404; valid product URLs include category. | P1 |
| S-02 | Product → cart → checkout → real payment webhook | Only verified provider webhook creates settled paid order. | P0 |
| S-03 | Payment decline, retry, duplicate submit, webhook replay | Clear recovery; one order/charge; reconciled status. | P0 |
| S-04 | Two authenticated users' designs | User B cannot list/read/download/delete User A design by altered ID. | P0 |
| S-05 | Upload allowed/unsupported/oversize/failed/complete/reload | Safe limits and durable design; retries work. | P1 |
| S-06 | Guest order tracking wrong/right email/reference | No order disclosure; valid lookup and tracking work. | P1 |
| S-07 | Auth sign-up/sign-in/reset/expiry/logout | Supabase cookies/session redirects work on deployed origin. | P1 |
| S-08 | Ops authorization | Anonymous/customer cannot access ops; operator can perform intended transitions only. | P1 |

## Automation and gate

Use Playwright with authenticated storage states for two users, API setup/teardown, visual viewport projects (1440, 1280, 1024, 768, 390, 375), axe scans and request interception for error states. CI must run typecheck, lint, unit/integration, migration check, E2E smoke on preview, and the full suite before production promotion. A release fails on any P0 scenario, console error, unexpected 5xx, accessibility critical issue, or unapproved visual regression.
