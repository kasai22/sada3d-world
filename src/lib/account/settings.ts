import type { AuthenticatedCustomerContext, CustomerSettings } from "./types";

/**
 * Account settings.
 *
 * Deliberately small, and smaller than it looks like it should be. Almost
 * everything a settings page usually holds belongs to a system SADA 3D does not
 * have yet:
 *
 *   the profile        comes from the identity provider — Phase 17
 *   password, sessions belong to the identity provider — Phase 17
 *   notifications      there is no notification system — Phase 12 said so and
 *                      nothing has changed
 *   preferences        there are none. Not "none yet configured": the system
 *                      holds no customer preference of any kind.
 *
 * So the page shows the profile it actually has, says plainly what is not
 * available and why, and offers no control that does nothing. A toggle that
 * saves to a store nothing reads is worse than no toggle: it is a promise the
 * product does not keep.
 */
export function getCustomerSettings(
  context: AuthenticatedCustomerContext,
): CustomerSettings {
  return {
    profile: context.profile,
    /*
     * False until the identity provider owns the record. Editing a name here
     * would write it somewhere nothing reads, and the change would appear to
     * work and would not.
     */
    editable: false,
  };
}
