/**
 * Reality 3D branding inside Payload's admin (Advanced CMS, at /cms).
 *
 * Rendered through Payload's supported component slots — `graphics.Logo`,
 * `graphics.Icon`, `beforeNavLinks`, `beforeDashboard`, `afterLogin` — and
 * styled by `app/(payload)/custom.css`, which only sets Payload's theme
 * variables and these `r3d-` classes. Nothing here reaches into Payload's DOM.
 *
 * Server components with no data and no client code. Relative imports only:
 * the Payload CLI loads the config without the `@/` alias.
 */

import { ADMIN_HOME, OPERATOR_LOGIN_PATH } from "../../lib/ops/routes";
import { BRAND } from "../../lib/brand";

function Glyph({ size }: { size: number }) {
  return (
    <span className="r3d-glyph" style={{ width: size, height: size }} aria-hidden="true">
      R3
    </span>
  );
}

/** The login page and first-user logo. */
export function Logo() {
  return (
    <span className="r3d-logo">
      <Glyph size={44} />
      <span className="r3d-logo__text">
        <span className="r3d-logo__name">
          REALITY<span className="r3d-accent"> 3D</span>
        </span>
        <span className="r3d-logo__tagline">{BRAND.tagline}</span>
        <span className="r3d-logo__product">Advanced CMS</span>
      </span>
    </span>
  );
}

/** The mark at the top of Payload's navigation and in its header. */
export function Mark() {
  return <Glyph size={26} />;
}

/** First item in Payload's navigation: the way back to the business application. */
export function BackToAdmin() {
  return (
    <div className="r3d-nav-home">
      <a className="r3d-nav-home__link" href={ADMIN_HOME}>
        <span aria-hidden="true">←</span> Reality 3D Admin
      </a>
      <p className="r3d-nav-home__note">Advanced CMS · raw collections</p>
    </div>
  );
}

/** Above Payload's collection cards: what this area is, and where daily work happens. */
export function AdvancedCmsNotice() {
  return (
    <section className="r3d-notice" aria-label="About Advanced CMS">
      <p className="r3d-notice__eyebrow">REALITY 3D · ADVANCED CMS</p>
      <h2 className="r3d-notice__title">Raw content collections</h2>
      <p className="r3d-notice__body">
        Products, categories, materials, price approvals, media, the homepage and operator accounts, as the CMS stores
        them — with drafts, versions, approvals and publishing. Day-to-day sales, orders, manufacturing, inventory and
        catalog work happens in Reality 3D Admin.
      </p>
      <a className="r3d-notice__link" href={ADMIN_HOME}>
        Open Reality 3D Admin →
      </a>
    </section>
  );
}

/** Under Payload's login form. */
export function LoginNote() {
  return (
    <p className="r3d-login-note">
      Operators normally sign in at <a href={OPERATOR_LOGIN_PATH}>Reality 3D Admin</a>. This page opens the Advanced CMS.
    </p>
  );
}
