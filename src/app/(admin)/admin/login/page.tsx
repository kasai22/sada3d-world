import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Icon } from "@/components/core/Icon";
import { BRAND } from "@/lib/brand";
import { currentOperator } from "@/lib/ops/operator";
import { CMS_CREATE_FIRST_USER_PATH, OPERATOR_FORGOT_PATH, safeOpsPath } from "@/lib/ops/routes";
import type { SearchParamsRecord } from "@/lib/ops/query";

import { SignInForm } from "./SignInForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Sign in" };

/** Whether any operator exists, so a fresh install is pointed at first-user setup. Unknown on error. */
async function operatorsExist(): Promise<boolean | null> {
  try {
    const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("@payload-config")]);
    const payload = await getPayload({ config });
    const { totalDocs } = await payload.count({ collection: "users", overrideAccess: true });
    return totalDocs > 0;
  } catch {
    return null;
  }
}

/**
 * Reality 3D Admin sign-in — the one page under /admin that renders without an
 * operator (it is outside the `(console)` group, and `console-guard.test.ts`
 * names it as the only exception).
 *
 * It shows no business data. A signed-in operator is sent straight on.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const returnTo = safeOpsPath(typeof params.redirect === "string" ? params.redirect : undefined);

  if (await currentOperator()) redirect(returnTo);

  const signedOut = params.signedOut === "1";
  const exist = await operatorsExist();

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="sign-in-title">
        <header className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            R3
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>
              REALITY<span className={styles.accent}> 3D</span>
            </span>
            <span className={styles.tagline}>{BRAND.tagline}</span>
          </span>
        </header>

        <div className={styles.rule} aria-hidden="true" />

        <p className={styles.eyebrow}>Admin</p>
        <h1 id="sign-in-title" className={styles.title}>
          Sign in to the business console
        </h1>
        <p className={styles.lead}>Sales, orders, manufacturing, inventory and the catalog. Operators only.</p>

        {signedOut && (
          <p className={styles.notice} role="status">
            <Icon name="check-circle" size={16} />
            <span>You are signed out.</span>
          </p>
        )}

        {exist === false ? (
          <p className={styles.notice} role="status">
            <Icon name="info" size={16} />
            <span>
              No operator account exists yet. <a href={CMS_CREATE_FIRST_USER_PATH}>Create the first operator</a> in the
              Advanced CMS, then sign in here.
            </span>
          </p>
        ) : (
          <SignInForm redirectTo={returnTo} />
        )}

        <footer className={styles.footer}>
          <a href={OPERATOR_FORGOT_PATH}>Forgot password</a>
          <span aria-hidden="true">·</span>
          <span>Customer? Sign in at the storefront — this console is for Reality 3D operators.</span>
        </footer>
      </section>
    </main>
  );
}
