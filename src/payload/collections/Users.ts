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
  auth: true,
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
