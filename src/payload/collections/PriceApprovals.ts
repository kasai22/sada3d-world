import type { CollectionConfig } from "payload";

import { adminsOnly, nobody } from "../access";
import { revalidateContent } from "../revalidate";

/**
 * Commercial price approvals — the audit trail for what a catalog part costs.
 *
 * ── Append-only ──────────────────────────────────────────────────────────
 *
 * A record is created and never edited or deleted, through the API or the
 * admin. A price change is a new record with a new effective date; a mistake is
 * corrected by a new record for the same date, which supersedes it. The
 * collection itself is therefore the change history: who approved which amount,
 * from when, and on what authority.
 *
 * ── How it takes effect ──────────────────────────────────────────────────
 *
 * The record in effect for a product is the latest one whose effective date has
 * arrived. A product's price status may be set to "approved" only while such a
 * record exists and its amount equals the product price (enforced on save), and
 * the storefront re-checks the same condition when it reads the catalog, so a
 * product whose approval is missing is served — and labelled — as provisional.
 *
 * Checkout never reads this collection from the client. Prices reach the cart
 * only through the catalog, on the server.
 *
 * ── Not public ───────────────────────────────────────────────────────────
 *
 * Read access is operators only. The storefront reads records server-side.
 */
export const PriceApprovals: CollectionConfig = {
  slug: "price-approvals",
  admin: {
    useAsTitle: "reference",
    defaultColumns: ["product", "amount", "effectiveFrom", "approvedBy", "reference", "createdAt"],
    group: "Catalog",
    description:
      "Approved commercial prices. Append-only: to change a price, add a new record; records cannot be edited or deleted.",
  },
  access: {
    read: adminsOnly,
    create: adminsOnly,
    update: nobody,
    delete: nobody,
  },
  hooks: {
    // beforeValidate, not beforeChange: `approvedBy` is required, and Payload
    // checks required fields between the two.
    beforeValidate: [
      ({ data, req, operation }) => {
        if (operation !== "create" || !data) return data;
        const record = { ...data };
        const user = req.user as { name?: string } | null | undefined;
        if (!record.approvedBy && user?.name) record.approvedBy = user.name;
        return record;
      },
    ],
    afterChange: [revalidateContent("catalog")],
  },
  fields: [
    {
      name: "product",
      type: "relationship",
      relationTo: "products",
      required: true,
      index: true,
    },
    {
      name: "amount",
      type: "number",
      required: true,
      min: 1,
      admin: { description: "Whole rupees, excluding GST." },
      validate: (value: number | null | undefined) =>
        Number.isInteger(value) && (value ?? 0) > 0 ? true : "Enter a whole number of rupees above zero.",
    },
    {
      name: "currency",
      type: "select",
      options: ["INR"],
      defaultValue: "INR",
      required: true,
    },
    {
      name: "effectiveFrom",
      type: "date",
      required: true,
      admin: {
        description: "The price applies from the start of this day (UTC).",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "reference",
      type: "text",
      required: true,
      admin: { description: "Where the decision is recorded, e.g. a signed price list and its version." },
    },
    {
      name: "approvedBy",
      type: "text",
      required: true,
      admin: { description: "Filled from the signed-in operator when left empty." },
    },
  ],
};
