import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

import { Categories } from "./payload/collections/Categories";
import { Materials } from "./payload/collections/Materials";
import { Media } from "./payload/collections/Media";
import { PriceApprovals } from "./payload/collections/PriceApprovals";
import { Products } from "./payload/collections/Products";
import { Users } from "./payload/collections/Users";
import { Homepage } from "./payload/globals/Homepage";

/**
 * Payload — the content management layer, and only that.
 *
 * ── What lives here ──────────────────────────────────────────────────────
 *
 * Products, categories, materials, media and the homepage copy. Editorial
 * things, owned by whoever writes them.
 *
 * ── What deliberately does not ───────────────────────────────────────────
 *
 * Customers, addresses, saved items, design metadata, orders, order items,
 * manufacturing jobs, shipments and events. None of them is content, and all of
 * them would be worse for being here: a Payload collection comes with a CRUD
 * admin, and an admin with a field for `order.status` is a second way to change
 * an order's state that walks straight past the Phase 12 state machine.
 *
 * The transactional tables are the application's own, defined in
 * `lib/db/schema.ts` and reached through the domain repositories. Same
 * database, same `DATABASE_URL`, different owner.
 *
 * ── Both owners, one database ────────────────────────────────────────────
 *
 * Payload generates and migrates its tables; `drizzle.config.ts` is filtered to
 * the four the application declares. Neither generator sees the other's tables,
 * so neither proposes to drop them.
 */

const directory = dirname(fileURLToPath(import.meta.url));

/**
 * The signing secret.
 *
 * Set, and it is used. Unset, and a random one is generated for this process —
 * which is fail-safe rather than fail-open: admin sessions do not survive a
 * restart, and nothing is forgeable, because the secret is neither empty nor a
 * value anybody else knows. A hardcoded fallback would be a published key.
 *
 * A build with no environment still completes, which is what keeps the
 * storefront deployable before the CMS is provisioned.
 */
function payloadSecret(): string {
  const configured = process.env.PAYLOAD_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[sada3d] PAYLOAD_SECRET is not set. A single-use secret has been " +
        "generated, so admin sessions will not survive a restart. Set it.",
    );
  }

  return crypto.randomUUID();
}

export default buildConfig({
  secret: payloadSecret(),
  /*
   * The CMS API moves off /api.
   *
   * Payload mounts a REST and GraphQL surface, and Phase 15 introduces the
   * product API — orders, checkout, quotes, model analysis — which is what
   * /api should mean to anyone reading a URL. Two catch-alls competing for the
   * same prefix is a precedence question nobody should have to reason about, so
   * the CMS gets its own.
   *
   * The admin panel follows this setting automatically.
   *
   * Stage 22.5: Payload’s admin moves to /cms. /admin is Reality 3D Admin, the
   * business application (src/app/(admin)); Payload’s panel stays fully working
   * underneath as Advanced CMS, with the same users and the same session.
   * `CMS_HOME` in src/lib/ops/routes.ts must match.
   */
  routes: { api: "/payload-api", admin: "/cms" },
  admin: {
    user: Users.slug,
    /*
     * Reality 3D, not Payload, through Payload’s supported extension points
     * only: the graphics slots, nav and dashboard slots, and a stylesheet of
     * theme variables imported by the (payload) layout. Nothing in Payload is
     * patched. The paths resolve against `importMap.baseDir` (this directory);
     * `npm run generate:importmap` rewrites the import map when they change.
     */
    theme: "dark",
    importMap: { baseDir: directory, importMapFile: join(directory, "app/(payload)/cms/importMap.ts") },
    components: {
      graphics: {
        Logo: "/payload/admin/Brand#Logo",
        Icon: "/payload/admin/Brand#Mark",
      },
      beforeNavLinks: ["/payload/admin/Brand#BackToAdmin"],
      beforeDashboard: ["/payload/admin/Brand#AdvancedCmsNotice"],
      afterLogin: ["/payload/admin/Brand#LoginNote"],
    },
    meta: {
      /*
       * Empty, deliberately.
       *
       * The root layout sets a metadata template of `%s — Reality 3D`, and it
       * applies to every route including this one — the (payload) route group
       * escapes the storefront's chrome, not the document's metadata. Setting a
       * suffix here too produced "Dashboard — Reality 3D — Reality 3D", and removing
       * the key entirely fell back to Payload's own " - Payload".
       *
       * Empty means Payload adds nothing and the root template adds the one
       * suffix: "Dashboard — Reality 3D".
       */
      titleSuffix: "",
      /*
       * Stage 22.5: without these Payload fills in its own favicon, "Payload
       * App" and its own description. The panel is not indexed or shared, so no
       * Open Graph image is generated either.
       */
      description: "Reality 3D Advanced CMS — Imagine. Design. Create.",
      applicationName: "Reality 3D Admin",
      icons: [{ rel: "icon", url: "/favicon.ico" }],
      defaultOGImageType: "off",
      openGraph: {
        siteName: "Reality 3D",
        title: "Reality 3D Advanced CMS",
        description: "Reality 3D Advanced CMS — Imagine. Design. Create.",
      },
      robots: { index: false, follow: false },
    },
  },
  collections: [Products, PriceApprovals, Categories, Materials, Media, Users],
  globals: [Homepage],
  /*
   * No rich-text editor is configured because no field is rich text. Every
   * editorial field here is plain text or a textarea, which is deliberate: the
   * storefront renders through the design system's type roles, and rich text
   * would let an editor introduce markup the design system has no styles for.
   *
   * Adding a richText field means adding an editor back.
   */
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL ?? "",
      /*
       * A database that cannot be reached fails a request in ten seconds rather
       * than holding it until the platform's own timeout. No query timeout here:
       * Payload's migrations run through this pool and may legitimately be long.
       */
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    },
    /*
     * Migrations, never push. `push` diffs a running database against whatever
     * schema the current checkout happens to have and applies the difference —
     * which is a schema change nobody reviewed. Development gets the same
     * discipline as production so the two cannot drift.
     */
    push: false,
    migrationDir: join(directory, "payload/migrations"),
  }),
  /*
   * GraphQL is what the admin uses. The playground is a development
   * convenience and is not something to leave mounted on a public origin.
   */
  graphQL: {
    disablePlaygroundInProduction: true,
  },
  typescript: {
    outputFile: join(directory, "payload-types.ts"),
  },
  sharp: undefined,
});
