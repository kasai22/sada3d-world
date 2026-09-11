import type { CollectionConfig } from "payload";

import { adminsOnly, canUseAdmin } from "../access";

/**
 * Payload users — content operators, and nobody else.
 *
 * **Not customers.** A SADA 3D customer has no row here and never will: their
 * identity arrives with Supabase Auth in Phase 17 and their records live in the
 * application's own tables. Two identity systems that both call themselves
 * "users" would eventually be joined by mistake, so the distinction is stated
 * here and enforced by there being no path between them.
 *
 * Every access rule is explicit. Payload's auth collections are readable by
 * default, and a readable users collection on a public endpoint hands out the
 * operator list.
 */
export const Users: CollectionConfig = {
  slug: "users",
  /*
   * Stated rather than inherited, so a Payload upgrade that changes a default
   * cannot quietly change how the admin is protected.
   *
   *   cookies           Secure in production; Lax, so the operator session is
   *                     not sent on a cross-site POST
   *   maxLoginAttempts  failed passwords before the account locks
   *   lockTime          how long it stays locked
   *   tokenExpiration   an operator session lasts two hours
   *
   * `maxLoginAttempts` and `lockTime` are Payload's own defaults (5 and ten
   * minutes) made explicit; lockTime is raised to fifteen. Neither adds a column:
   * the lockout fields already exist because the default was already on.
   */
  auth: {
    cookies: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    },
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 2 * 60 * 60,
  },
  admin: {
    useAsTitle: "email",
    group: "System",
    description: "Content operators with access to this admin.",
  },
  access: {
    read: adminsOnly,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
    // Unlocking a locked-out operator is an administrator's decision.
    unlock: adminsOnly,
    admin: canUseAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: { description: "Shown in version history and audit trails." },
    },
  ],
};
