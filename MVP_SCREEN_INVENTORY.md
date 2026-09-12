# SADA3D MVP Screen and State Inventory

Audit date: 2026-09-13. “Functional” is source-verified unless otherwise noted; it is not a substitute for browser E2E evidence.

| Module | Screen/State | Route | Implemented? | Reachable? | Functional? | Evidence |
|---|---|---|---|---|---|---|
| Storefront | Home | `/` | Yes | Yes | Partially | Page/components exist; featured card links malformed. |
| Catalog | Shop list/filter/search/sort/empty/loading/error | `/shop`, `/shop/[category]` | Yes | Yes | Partially | Routes and shop error/loading; local mock catalog default. |
| Product | Detail/3D fallback/configure | `/shop/[category]/[slug]` | Yes | Yes | Partially | Correct route exists; home links omit category. |
| Informational | Materials | `/materials` | No | Linked | No | Header/Footer link, no route. |
| Informational | Solutions | `/solutions` | No | Linked | No | Header/Footer link, no route. |
| Informational | How it works | `/how-it-works` | No | Linked | No | Header/Footer link, no route. |
| Custom print | Upload/analyse/configure/quote/persist errors | `/custom-print` | Yes | Yes | Partially | Workflow/API/storage exists; live browser test not run. |
| Cart | Empty/populated/change quantity/delete | `/cart` | Yes | Yes | Partially | Route/components/source tests; no E2E run. |
| Checkout | Details/validation/placing/error | `/checkout` | Yes | Yes | No production payment | Mock payment adapter only. |
| Checkout | Success/no recent order | `/checkout/success` | Yes | Yes | Partially | Cookie-based confirmation implemented. |
| Guest tracking | Lookup/recent/not-found | `/orders`, `/orders/[reference]` | Yes | Yes | Partially | Routes/API exist; no browser test. |
| Auth | Sign in/signup/forgot/reset/signed-in/unavailable | `/login`, `/login/reset-password`, `/auth/confirm` | Yes | Yes | Partially | Supabase source support; real environment not verified. |
| Account | Overview/loading/error/sign-in required | `/account` | Yes | Yes | Partially | Layout, loading/error/sign-in components. |
| Account | Orders/list/detail/loading | `/account/orders`, `/account/orders/[ref]` | Yes | Yes | Partially | Routes/actions/repositories. |
| Account | Designs/list/download/delete/loading | `/account/designs` | Yes | Yes | Partially | APIs have ownership controls; deployed validation absent. |
| Account | Addresses | `/account/addresses` | Yes | Yes | Partially | Page/actions exist. |
| Account | Saved products | `/account/saved` | Yes | Yes | Partially | Page/actions exist. |
| Account | Settings/password/logout | `/account/settings` | Yes | Yes | Partially | Forms/actions exist. |
| Ops | Login/error/not-found/loading | `/admin`, `/ops` | Yes | Yes | Partially | Payload + route boundaries; operator journey untested. |
| Ops | Orders/customers/designs/production/payments/issues/settings | `/ops/*` | Yes | Yes | Partially | Route family and components present; mock payment notice. |
| Global | 404 | unmatched | Yes | Yes | Partially | `src/app/not-found.tsx`. |
| Global | Route error/loading | route dependent | Partial | Partial | Partial | Shop/account/ops have coverage; root/cart/checkout/custom-print/login gaps. |
| Mobile | Menu drawer/open/close | all storefront | Yes | Yes | Partially | Native dialog source; visual/keyboard test not executed. |

Notes: no notifications/help/support/privacy/terms/contact route was found. Responsive, offline, and browser-level permission/retry states remain **NOT VERIFIED** until automation is added.
