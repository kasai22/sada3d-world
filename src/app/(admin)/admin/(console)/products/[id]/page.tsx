import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { EmptyState } from "@/components/ops/EmptyState";
import { PageHeader } from "@/components/ops/PageHeader";
import { ConsumptionForm } from "@/components/ops/product/ConsumptionForm";
import { ProductForm } from "@/components/ops/product/ProductForm";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { readinessSections, type PanelSection } from "@/lib/catalog/readiness-panel";
import { getProductConsumption, listConsumptionInputs } from "@/lib/inventory/consumption";
import { formatPerUnit, rowsFromLines } from "@/lib/inventory/consumption-rules";
import { getProductWorkspace } from "@/lib/ops/catalog-admin";
import { formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { getProductFormOptions, valuesFromProduct } from "@/lib/ops/product-admin";
import { PRODUCT_SECTIONS, type ProductSection } from "@/lib/ops/product-form";
import { APPROVAL_LABEL, LAUNCH_TONE, STAGE_LABEL } from "@/lib/ops/product-labels";
import { hrefWith, readEnum, type SearchParamsRecord } from "@/lib/ops/query";
import { formatCost } from "@/components/ops/inventory/display";
import { cmsCollectionHref } from "@/lib/ops/routes";
import type { Product as PayloadProduct } from "@/payload-types";

import { saveConsumptionAction, updateProductSectionAction } from "./actions";
import styles from "./workspace.module.css";

export const metadata: Metadata = { title: "Product" };

const TABS = ["overview", "manufacturing", "production", "pricing", "media", "model", "seo", "launch"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  manufacturing: "Manufacturing",
  production: "Production & Consumption",
  pricing: "Pricing",
  media: "Media",
  model: "3D model",
  seo: "SEO",
  launch: "Launch",
};

const SECTION_LABEL: Record<PanelSection, string> = {
  TECHNICAL: "Technical",
  MANUFACTURING: "Manufacturing",
  COMMERCIAL: "Commercial",
  PRICE: "Price",
  MEDIA: "Media",
  "PRODUCT APPROVAL": "Approval",
  PUBLICATION: "Publication",
};

const PRICE_STATUS_LABEL: Record<PayloadProduct["priceStatus"], string> = {
  provisional: "Provisional — not approved",
  approved: "Approved — matches a price approval in effect",
  "quote-only": "Quote only — priced from geometry",
};

const relationLabel = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : null;
  const code = typeof record.value === "string" ? record.value.toUpperCase() : null;
  return name && code ? `${name} (${code})` : (name ?? code);
};

const values = (list: readonly { value: string }[] | null | undefined) => (list ?? []).map((entry) => entry.value).filter(Boolean);

function Facts({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === "" ? <span className={styles.missing}>Not set</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Approval({ record }: { record?: { reference?: string | null; approvedBy?: string | null; approvedOn?: string | null } }) {
  if (!record?.reference && !record?.approvedBy) return <span className={styles.missing}>Not recorded</span>;
  return (
    <span>
      {record.reference ?? "No reference"} · {record.approvedBy ?? "approver not named"}
      {record.approvedOn ? ` · ${String(record.approvedOn).slice(0, 10)}` : ""}
    </span>
  );
}

/**
 * The product workspace (Stage 22.5).
 *
 * One product, the way an operator thinks about it: overview, manufacturing,
 * pricing, media, model, SEO and launch — with the Stage 20 readiness panel
 * always beside it. Each section is edited here and saved through the Products
 * collection (`product-admin.ts`). Approvals, price-approval records, version
 * history, publishing, specifications and gallery uploads open the same product
 * in Advanced CMS, where the approval guard and the append-only ledger live.
 */
export default async function ProductWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { id: raw } = await params;
  const operator = await requireOperator(`/admin/products/${encodeURIComponent(raw)}`);
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  const query = await searchParams;
  const tab = readEnum(query, "tab", TABS) ?? "overview";
  const created = query.created === "1";
  const section = (PRODUCT_SECTIONS as readonly string[]).includes(tab) ? (tab as ProductSection) : null;

  const [workspace, options, inputs] = await Promise.all([
    Number.isSafeInteger(id) ? getProductWorkspace(operator, id) : Promise.resolve(null),
    section ? getProductFormOptions(operator).catch(() => null) : Promise.resolve(null),
    tab === "production" ? listConsumptionInputs(operator).catch(() => null) : Promise.resolve([]),
  ]);
  if (!workspace) notFound();
  const consumption = await getProductConsumption(operator, workspace.doc.productId).catch(() => null);

  const { doc, status } = workspace;
  const path = `/admin/products/${doc.id}`;
  const cmsHref = cmsCollectionHref("products", doc.id);
  const reasons = status.reasons.split("\n");
  const sections = readinessSections(reasons, status.price === "QUOTE_ONLY");
  const blocking = sections.filter((section) => !section.passed).length;
  const nextSection = sections.find((section) => !section.passed);
  const productCode = doc.productId.toUpperCase();

  return (
    <>
      <PageHeader
        title={doc.name}
        crumbs={[
          { label: "Products", href: "/admin/products" },
          { label: productCode },
        ]}
        meta={
          <>
            <StatusBadge tone={LAUNCH_TONE[status.stage]}>{STAGE_LABEL[status.stage]}</StatusBadge>
            <StatusBadge tone={workspace.published ? "success" : "neutral"}>
              {workspace.published ? "Published" : "Not published"}
            </StatusBadge>
            {workspace.hasUnpublishedChanges && <StatusBadge tone="warning">Draft changes</StatusBadge>}
          </>
        }
        actions={
          <Button href={cmsHref} size="sm" variant="ghost" iconLeft="settings-2">
            Versions &amp; approval (Advanced CMS)
          </Button>
        }
        description={
          <>
            <span className={styles.mono}>{productCode}</span>
            {doc.sku ? <> · SKU <span className={styles.mono}>{doc.sku}</span></> : " · No SKU assigned"} · updated{" "}
            <LocalTime value={doc.updatedAt} /> · {doc.source === "seed" ? "repository seed" : "administrator-managed"}
          </>
        }
      />

      <SectionTabs
        label="Product sections"
        tabs={TABS.map((option) => ({
          label:
            option === "launch"
              ? `${TAB_LABEL[option]}${blocking > 0 ? ` · ${blocking}` : ""}`
              : option === "production" && consumption && consumption.lines.length > 0
                ? `${TAB_LABEL[option]} · ${consumption.lines.length}`
                : TAB_LABEL[option],
          href: hrefWith(path, { tab: option === "overview" ? undefined : option }),
          current: option === tab,
        }))}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          {created && (
            <p className={styles.notice} role="status">
              <Icon name="check-circle" size={16} />
              <span>
                Product created as an unpublished draft ({productCode}). Its launch status is on the right; nothing has been
                approved or published.
              </span>
            </p>
          )}

          {query.consumption === "unsaved" && (
            <p className={styles.warning} role="alert">
              <Icon name="alert" size={16} />
              <span>The product was created, but its consumption lines could not be saved. Add them again below.</span>
            </p>
          )}

          {tab === "production" &&
            (consumption && inputs ? (
              <ConsumptionForm
                action={saveConsumptionAction.bind(null, doc.id)}
                inputs={[
                  ...inputs,
                  // Items already on the product but since deactivated: shown and flagged, never offered.
                  ...consumption.lines
                    .filter((line) => !inputs.some((input) => input.id === line.inventoryItemId))
                    .map((line) => line.item),
                ]}
                initial={rowsFromLines(consumption.lines)}
              />
            ) : (
              <Panel padded={false}>
                <EmptyState compact tone="problem" icon="error" title="Consumption is unavailable">
                  <p>The inventory could not be read. Reload the page; if it persists, check the database on the Settings page.</p>
                </EmptyState>
              </Panel>
            ))}

          {section && options && (
            <ProductForm
              key={section}
              mode="edit"
              sections={[section]}
              options={options}
              initial={valuesFromProduct(doc)}
              action={updateProductSectionAction.bind(null, doc.id, section)}
              cancelHref="/admin/products"
            />
          )}
          {section && !options && (
            <Panel padded={false}>
              <EmptyState compact tone="problem" icon="error" title="Editing is unavailable">
                <p>The catalog options could not be read. Reload the page; if it persists, check the database on the Settings page.</p>
              </EmptyState>
            </Panel>
          )}

          {tab === "overview" && (
            <Panel title="Commercial record" titleAs="h2" meta="Recorded in Advanced CMS">
              <Facts
                rows={[
                  ["Browse category", workspace.browseCategoryName],
                  ["Commercial approval", <Approval key="c" record={doc.commercialApproval} />],
                  ["Featured", doc.featured ? "Yes" : "No"],
                  ["Badge", doc.badge],
                ]}
              />
            </Panel>
          )}

          {tab === "manufacturing" && (
            <Panel title="Further manufacturing detail" titleAs="h2" meta="Recorded in Advanced CMS">
              <Facts
                rows={[
                  ["Materials offered", (doc.materials ?? []).map(relationLabel).filter(Boolean).join(", ")],
                  ["Colours offered", values(doc.colors).join(", ")],
                  ["Material notes", values(doc.materialNotes).join(" · ")],
                  ["Weight", doc.weightGrams ? `${doc.weightGrams} g` : null],
                ]}
              />
              {(doc.specifications ?? []).length > 0 ? (
                <table className={styles.specs}>
                  <caption>Specifications</caption>
                  <tbody>
                    {(doc.specifications ?? []).map((spec) => (
                      <tr key={spec.id ?? spec.label}>
                        <th scope="row">{spec.label}</th>
                        <td>{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.note}>No specifications entered. Measured specifications are recorded in Advanced CMS.</p>
              )}
              <p className={styles.note}>
                <Icon name="info" size={14} />
                No machine telemetry is recorded. Capability approvals live in the business decision ledger, not per product.
              </p>
            </Panel>
          )}

          {tab === "pricing" && (
            <Panel
              title="Price approvals"
              titleAs="h2"
              meta={`Append-only · ${PRICE_STATUS_LABEL[doc.priceStatus]}`}
              padded={false}
              actions={
                <a className={styles.link} href={`${cmsCollectionHref("price-approvals")}/create`}>
                  Record approval in Advanced CMS
                </a>
              }
            >
              {workspace.priceApprovals.length === 0 ? (
                <EmptyState compact icon="wallet" title="No price approval recorded">
                  <p>A fixed price counts as approved only when an approval record in effect matches it.</p>
                </EmptyState>
              ) : (
                <table className={styles.table}>
                  <caption className="u-visually-hidden">Price approvals for this product</caption>
                  <thead>
                    <tr>
                      <th scope="col">Effective from</th>
                      <th scope="col" className={styles.num}>
                        Amount
                      </th>
                      <th scope="col">Reference</th>
                      <th scope="col">Approved by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.priceApprovals.map((record) => (
                      <tr key={record.id}>
                        <td className={styles.mono}>{record.effectiveFrom}</td>
                        <td className={clsx(styles.mono, styles.num)}>{formatINR(record.amount)}</td>
                        <td>{record.reference}</td>
                        <td>{record.approvedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}

          {tab === "media" && (
            <Panel title="Media approval" titleAs="h2" meta="Recorded in Advanced CMS">
              <Facts
                rows={[
                  ["Media approval", <Approval key="m" record={doc.visual?.approval} />],
                  ["Gallery", `${(doc.gallery ?? []).length} ${(doc.gallery ?? []).length === 1 ? "file" : "files"}`],
                  ["Assessment", status.media],
                ]}
              />
            </Panel>
          )}

          {tab === "launch" && (
            <>
              <Panel title="Approval" titleAs="h2" meta="Recorded in Advanced CMS › Approval">
                <Facts
                  rows={[
                    ["Approval status", APPROVAL_LABEL[doc.approvalStatus]],
                    ["Product approval", <Approval key="p" record={doc.approval} />],
                    ["Commercial approval", <Approval key="c" record={doc.commercialApproval} />],
                  ]}
                />
                <div className={styles.buttons}>
                  <Button href={cmsHref} size="sm" variant="primary" iconLeft="check-circle">
                    Review and approve in CMS
                  </Button>
                </div>
              </Panel>
              <Panel title="Open questions" titleAs="h2" padded={false}>
                {(doc.openQuestions ?? []).length === 0 ? (
                  <EmptyState compact icon="check-circle" title="No open questions">
                    <p>Nothing is waiting on a business answer for this product.</p>
                  </EmptyState>
                ) : (
                  <ul className={styles.questions}>
                    {(doc.openQuestions ?? []).map((question) => (
                      <li key={question.id ?? question.questionId}>
                        <StatusBadge tone={question.answer === "unanswered" || !question.answer ? "warning" : "success"}>
                          {question.answer === "yes" ? "Yes" : question.answer === "no" ? "No" : "Unanswered"}
                        </StatusBadge>
                        <span>
                          <span className={styles.mono}>{question.questionId}</span> {question.question}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>

        {/* ---------------- The Stage 20 readiness panel, always visible ---------------- */}
        <aside className={styles.rail} aria-labelledby="launch-status">
          <section className={styles.readiness}>
            <header className={styles.readinessHeader}>
              <h2 id="launch-status" className={styles.readinessTitle}>
                Launch status
              </h2>
              <StatusBadge tone={LAUNCH_TONE[status.stage]}>{STAGE_LABEL[status.stage]}</StatusBadge>
            </header>
            <div className={styles.verdict}>
              <p className={styles.verdictLine}>
                <strong>
                  {sections.length - blocking} of {sections.length}
                </strong>{" "}
                checks pass
              </p>
              <div className={styles.meter} aria-hidden="true">
                {sections.map((section) => (
                  <span key={section.section} className={section.passed ? styles.meterPass : styles.meterFail} />
                ))}
              </div>
              {nextSection ? (
                <p className={styles.nextStep}>
                  <span className={styles.nextLabel}>Next step</span>
                  {SECTION_LABEL[nextSection.section]}: {nextSection.lines[0]}
                  {nextSection.action && <span className={styles.nextWhere}>Fix in: {nextSection.action}</span>}
                </p>
              ) : (
                <p className={styles.nextStep}>
                  <span className={styles.nextLabel}>Next step</span>
                  Nothing blocks this product. It is sellable in launch mode.
                </p>
              )}
            </div>
            <ol className={styles.checks}>
              {sections.map((section) => (
                <li key={section.section} className={clsx(styles.check, section.passed ? styles.pass : styles.fail)}>
                  <span className={styles.checkMark} aria-hidden="true">
                    <Icon name={section.passed ? "check" : "x"} size={14} />
                  </span>
                  <div className={styles.checkBody}>
                    <p className={styles.checkLabel}>
                      {SECTION_LABEL[section.section]}
                      <span className="u-visually-hidden">: {section.passed ? "passes" : "blocking"}</span>
                    </p>
                    {section.passed ? (
                      <p className={styles.checkNote}>{section.lines[0]}</p>
                    ) : (
                      <>
                        <ul className={styles.reasons}>
                          {section.lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        {section.action && <p className={styles.checkNote}>Fix in: {section.action}</p>}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.readinessFoot}>
              Same assessment as <span className={styles.mono}>content:verify --require-launch</span>.
            </p>
          </section>

          {/* Stage 22.7: expected inputs. Informational — not a launch check. */}
          <section className={styles.readiness} aria-labelledby="production-inputs">
            <header className={styles.readinessHeader}>
              <h2 id="production-inputs" className={styles.readinessTitle}>
                Production inputs
              </h2>
              <StatusBadge tone={consumption && consumption.lines.length > 0 ? "success" : "neutral"}>
                {consumption === null ? "Unavailable" : consumption.lines.length > 0 ? "Defined" : "Not defined"}
              </StatusBadge>
            </header>
            {consumption === null ? (
              <p className={styles.readinessFoot}>The inventory could not be read.</p>
            ) : consumption.lines.length === 0 ? (
              <p className={styles.readinessFoot}>Manufacturing consumption not defined. It does not block approval.</p>
            ) : (
              <>
                <ul className={styles.inputs}>
                  {consumption.lines.map((line) => (
                    <li key={line.id}>
                      <span>{line.item.group === "RAW_MATERIAL" && line.item.material ? `${line.item.material.toUpperCase()} · ${line.item.colour ?? "—"}` : line.item.name}</span>
                      <span className={styles.mono}>{formatPerUnit(line.quantity, line.item.unit)} / unit</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.readinessFoot}>
                  {consumption.totalCostPaise !== null
                    ? `Estimated input cost ${formatCost(consumption.totalCostPaise / 100)} per unit.`
                    : "Estimated input cost: unavailable — not every input has a recorded cost."}
                  {consumption.notStocked > 0 &&
                    ` ${consumption.notStocked} ${consumption.notStocked === 1 ? "input is" : "inputs are"} not currently stocked.`}
                </p>
              </>
            )}
            {tab !== "production" && (
              <p className={styles.readinessFoot}>
                <Link href={hrefWith(path, { tab: "production" })}>Edit production &amp; consumption</Link>
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
