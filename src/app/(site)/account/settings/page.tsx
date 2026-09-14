import type { Metadata } from "next";

import {
  AccountIdentity,
  AccountShell,
  AccountSignInRequired,
  SignOutButton,
} from "@/components/account";
import { Button, Icon } from "@/components/core";
import { SectionHeading, SpecTable } from "@/components/structure";
import { requireCustomerContext, resolveCredentialsAdapter } from "@/lib/account/identity";
import { RESET_PASSWORD_PATH } from "@/lib/account/routes";
import { getCustomerSettings } from "@/lib/account/settings";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Account settings.
 *
 * Deliberately short. Almost everything a settings page usually holds belongs
 * to systems Reality 3D does not have yet, and the honest version of this page is
 * one that says so instead of offering controls that do nothing.
 *
 * There are no notification toggles, because there are no notifications. There
 * is no password field, because there is no password. There is no theme, no
 * language and no currency, because the product has one of each. A switch that
 * saves to a store nothing reads is a promise the product does not keep.
 */
export default async function AccountSettingsPage() {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/settings" />;
  }

  const settings = getCustomerSettings(gate.context);
  const { profile } = settings;

  return (
    <AccountShell
      title="Settings"
      description="Your profile and what the account can do."
      crumbs={[{ label: "Settings" }]}
    >
      <div className={styles.sections}>
        <section aria-labelledby="settings-profile">
          <SectionHeading as="h2" id="settings-profile" size="sm">
            Profile
          </SectionHeading>

          <AccountIdentity
            profile={profile}
            development={gate.context.development}
          />

          <SpecTable
            className={styles.table}
            caption="Profile details"
            rows={[
              { label: "Name", value: profile.name ?? "Not set" },
              { label: "Email", value: profile.email ?? "Not set" },
              ...(profile.emailVerified === undefined
                ? []
                : [
                    {
                      label: "Email status",
                      value: profile.emailVerified ? "Confirmed" : "Not confirmed",
                    },
                  ]),
              { label: "Phone", value: profile.phone ?? "Not set" },
            ]}
          />

          {!settings.editable && (
            <p className={styles.note}>
              <Icon name="info" size={14} />
              <span>
                Your profile comes from your sign-in and cannot be edited here
                yet. Delivery details for a specific order are taken at
                checkout, and delivery addresses are managed under Addresses.
              </span>
            </p>
          )}

          <p className={styles.action}>
            <Button href="/account/addresses" variant="secondary">
              Manage addresses
            </Button>
          </p>
        </section>

        <section aria-labelledby="settings-security">
          <SectionHeading as="h2" id="settings-security" size="sm">
            Sign-in and security
          </SectionHeading>
          {resolveCredentialsAdapter() ? (
            <>
              <p className={styles.body}>
                You sign in with your email and password. Reality 3D never stores
                your password; the sign-in provider holds it. Signing out ends
                the session on this device.
              </p>
              <p className={styles.action}>
                <Button href={RESET_PASSWORD_PATH} variant="secondary">
                  Change password
                </Button>{" "}
                <SignOutButton variant="secondary" size="md" />
              </p>
            </>
          ) : (
            <p className={styles.body}>
              Customer sign-in is not configured in this environment, so there is
              no password or session to manage here.
            </p>
          )}
        </section>

        <section aria-labelledby="settings-notifications">
          <SectionHeading as="h2" id="settings-notifications" size="sm">
            Notifications
          </SectionHeading>
          <p className={styles.body}>
            Reality 3D does not send notifications yet, so there is nothing to turn
            on or off. Order updates are shown on the order itself, and this
            section will list real choices when there are some to make.
          </p>
        </section>
      </div>
    </AccountShell>
  );
}
