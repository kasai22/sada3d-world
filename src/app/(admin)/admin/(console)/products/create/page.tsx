import type { Metadata } from "next";

import { EmptyState } from "@/components/ops/EmptyState";
import { PageHeader } from "@/components/ops/PageHeader";
import { ProductForm } from "@/components/ops/product/ProductForm";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { requireOperator } from "@/lib/ops/operator";
import { listConsumptionInputs } from "@/lib/inventory/consumption";
import { getProductFormOptions } from "@/lib/ops/product-admin";
import { EMPTY_PRODUCT_FORM, PRODUCT_SECTIONS } from "@/lib/ops/product-form";

import { createProductAction } from "../actions";
import styles from "../[id]/workspace.module.css";

export const metadata: Metadata = { title: "New product" };

const PATH = "/admin/products/create";

/**
 * Product creation, inside Reality 3D Admin.
 *
 * The same sections as the product workspace. Saving creates an unpublished
 * product with approval status Draft through the Products collection — every
 * Payload hook and validation runs — and opens its workspace, where the launch
 * status shows what it still needs.
 */
export default async function CreateProductPage() {
  const operator = await requireOperator(PATH);

  let options;
  let inputs: Awaited<ReturnType<typeof listConsumptionInputs>> | null;
  try {
    [options, inputs] = await Promise.all([getProductFormOptions(operator), listConsumptionInputs(operator)]);
  } catch (error) {
    console.error("[sada3d] product form options could not be read", error);
    options = null;
    inputs = null;
  }

  if (!inputs) options = null;

  return (
    <>
      <PageHeader
        title="New product"
        crumbs={[{ label: "Products", href: "/admin/products" }, { label: "New product" }]}
        meta={
          <>
            <StatusBadge tone="neutral">Draft</StatusBadge>
            <StatusBadge tone="neutral">Not published</StatusBadge>
          </>
        }
        description="Describe the part. It is saved as an unpublished draft; its launch status then shows what is still needed before it can be approved."
      />

      {!options ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="The product form is unavailable">
            <p>The catalog could not be read, so categories and materials cannot be offered. Reload the page; if it persists, check the database on the Settings page.</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <ProductForm
              mode="create"
              sections={PRODUCT_SECTIONS}
              options={options}
              initial={EMPTY_PRODUCT_FORM}
              action={createProductAction}
              cancelHref="/admin/products"
              consumption={{ inputs: inputs ?? [], initial: [] }}
            />
          </div>
          <aside className={styles.rail} aria-labelledby="launch-status">
            <section className={styles.readiness}>
              <header className={styles.readinessHeader}>
                <h2 id="launch-status" className={styles.readinessTitle}>
                  Launch status
                </h2>
                <StatusBadge tone="danger">Not ready</StatusBadge>
              </header>
              <p className={styles.readinessFoot}>
                A new product starts as a draft. After saving, its workspace lists every launch prerequisite — technical,
                manufacturing, commercial, price, media, approval and publication — and where each is fixed.
              </p>
              <ul className={`${styles.reasons} ${styles.railList}`}>
                <li>Created unpublished, approval status Draft</li>
                <li>Prices stay provisional until a price approval matches</li>
                <li>Media stays unapproved until a media approval is recorded</li>
                <li>Coming Soon capabilities can be drafted, never launched</li>
                <li>Production &amp; Consumption is optional and never moves stock</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
