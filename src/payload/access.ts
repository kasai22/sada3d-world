import type { Access, FieldAccess } from "payload";

/**
 * Payload access control.
 *
 * Written out explicitly for every collection, because Payload's default is
 * permissive: a collection with no `access` block is readable by anyone who can
 * reach the REST endpoint. The admin UI needs those endpoints mounted, so the
 * only thing standing between an anonymous request and the CMS is what is
 * written here.
 *
 * Two audiences, and they are not the same:
 *
 *   ADMIN     a signed-in Payload user. Content operators. Full read, and
 *             write where the collection allows it.
 *   PUBLIC    everyone else, including the storefront's own server-side
 *             queries. Published documents only, and nothing else at all.
 *
 * Nothing here grants a customer anything. Customers are not Payload users and
 * have no Payload identity — their records live in the application's own tables
 * behind the account domain, and this file has no reach into them.
 */

/** A signed-in Payload user. There is no other kind of write. */
export const adminsOnly: Access = ({ req }) => Boolean(req.user);

/**
 * The same rule, typed for `access.admin`.
 *
 * That one gates entry to the admin panel itself and accepts only a boolean —
 * a query constraint is meaningless when the question is "may this person open
 * the CMS at all".
 */
export const canUseAdmin = ({ req }: { req: { user?: unknown } }): boolean =>
  Boolean(req.user);

/** Nobody, ever, through the API. Used where a collection is derived. */
export const nobody: Access = () => false;

/**
 * Public read, restricted to published documents.
 *
 * Returns a query constraint rather than a boolean, so the restriction is
 * applied by the database rather than by filtering afterwards — a filter that
 * runs after the read is a filter that can be forgotten, and a `where` cannot
 * be paged around.
 *
 * An admin reads everything, which is what makes draft preview possible.
 */
export const publishedOrAdmin: Access = ({ req }) => {
  if (req.user) return true;

  return {
    _status: { equals: "published" },
  };
};

/**
 * Fields an operator may see but the public may not.
 *
 * Internal notes and anything editorial-only. Field-level access is applied on
 * top of the document-level rule above, so a published document can still keep
 * a field to itself.
 */
export const adminFieldOnly: FieldAccess = ({ req }) => Boolean(req.user);
