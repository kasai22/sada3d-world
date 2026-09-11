import { Icon } from "@/components/core";
import type { CustomerProfile } from "@/lib/account/types";

import styles from "./AccountIdentity.module.css";

export interface AccountIdentityProps {
  profile: CustomerProfile;
  /** True when this identity came from the development adapter. */
  development: boolean;
}

/**
 * Who the portal thinks you are.
 *
 * Shows only what the identity provider actually supplied. A profile with no
 * name shows no name — it does not fall back to an email dressed up as one, and
 * it does not greet anybody by a value it invented.
 *
 * When the identity is the development one, that is the first thing this says.
 * A reviewer must never be left believing they are signed in to something real.
 */
export function AccountIdentity({ profile, development }: AccountIdentityProps) {
  return (
    <div className={styles.identity}>
      {development && (
        <p className={styles.development} role="note">
          <Icon name="info" size={15} />
          <span>
            Development identity. Supabase Auth is not configured in this build,
            so this is a fixed local customer that exists outside production
            only.
          </span>
        </p>
      )}

      <div className={styles.body}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name="user" size={20} />
        </span>

        <div className={styles.detail}>
          {profile.name ? (
            <p className={styles.name}>{profile.name}</p>
          ) : (
            <p className={styles.missing}>No name on this account</p>
          )}

          {profile.email && <p className={styles.contact}>{profile.email}</p>}
          {profile.emailVerified !== undefined && (
            <p className={styles.contact}>
              {profile.emailVerified ? "Email confirmed" : "Email not confirmed"}
            </p>
          )}
          {profile.phone && <p className={styles.contact}>{profile.phone}</p>}
        </div>
      </div>
    </div>
  );
}
