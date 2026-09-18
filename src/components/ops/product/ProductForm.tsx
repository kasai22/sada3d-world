"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { Checkbox } from "@/components/forms/Checkbox";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Textarea } from "@/components/forms/Textarea";
import {
  CAPABILITY_SUFFIX,
  LIMITS,
  SECTION_FIELDS,
  SECTION_LABEL,
  firstErrorSection,
  slugify,
  type FieldErrors,
  type ProductFormOptions,
  type ProductFormValues,
  type ProductSection,
} from "@/lib/ops/product-form";

import { ConsumptionEditor, type ConsumptionInput, type ConsumptionRow } from "./ConsumptionEditor";
import styles from "./ProductForm.module.css";

export interface ProductFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: FieldErrors;
  /** What was submitted, so a refused form comes back as the operator left it. */
  values?: ProductFormValues;
  /** Changes on every submission, to remount the fields with `values`. */
  at?: number;
  /** Stage 22.7: errors on the consumption lines, by row. */
  consumptionErrors?: Record<number, string>;
}

export type ProductFormAction = (previous: ProductFormState, form: FormData) => Promise<ProductFormState>;

interface Props {
  mode: "create" | "edit";
  /** Create shows every section as tabs; edit shows the one section it saves. */
  sections: readonly ProductSection[];
  options: ProductFormOptions;
  initial: ProductFormValues;
  action: ProductFormAction;
  cancelHref: string;
  /** Stage 22.7: the Production & Consumption tab, on the create form. */
  consumption?: { inputs: readonly ConsumptionInput[]; initial: readonly ConsumptionRow[] };
}

const PRODUCT_CLASSES = [
  { value: "", label: "Not decided yet" },
  { value: "STANDARD_CATALOG_PRODUCT", label: "Standard catalog product" },
  { value: "CONFIGURABLE_PRODUCT", label: "Configurable product" },
  { value: "QUOTE_ONLY_PRODUCT", label: "Quote-only product" },
];
const PRICING_MODELS = [
  { value: "", label: "Not decided yet" },
  { value: "FIXED", label: "Fixed" },
  { value: "CONFIGURABLE", label: "Configurable" },
  { value: "QUOTE_ONLY", label: "Quote only" },
];

type TabKey = ProductSection | "production";

export function ProductForm({ mode, sections, options, initial, action, cancelHref, consumption }: Props) {
  const [state, submit, pending] = useActionState<ProductFormState, FormData>(action, { status: "idle" });
  const [openTab, setOpenTab] = useState<TabKey>(sections[0] ?? "overview");
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  // A refused submission opens the first section with an error; a saved one is clean. Adjusted during render.
  if (state.at !== seenAt) {
    setSeenAt(state.at);
    if (state.status === "saved") setDirty(false);
    const target = state.errors ? firstErrorSection(state.errors) : null;
    if (target && sections.includes(target)) setOpenTab(target);
    else if (consumption && state.consumptionErrors && Object.keys(state.consumptionErrors).length > 0) setOpenTab("production");
  }

  // Leaving with unsaved edits asks first. Navigation inside the app is not intercepted.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const values = state.status === "error" && state.values ? state.values : initial;
  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const tabbed = sections.length > 1;
  const consumptionErrors = state.status === "error" ? (state.consumptionErrors ?? {}) : {};
  const tabs: TabKey[] = consumption
    ? sections.flatMap((section): TabKey[] => (section === "manufacturing" ? [section, "production"] : [section]))
    : [...sections];
  const errorCount = (tab: TabKey) => (tab === "production" ? Object.keys(consumptionErrors).length : countIn(errors, tab));

  return (
    <form action={submit} className={styles.form} noValidate onInput={() => setDirty(true)}>
      {tabbed && (
        <div className={styles.tabs} role="tablist" aria-label="Product sections">
          {tabs.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              id={`tab-${section}`}
              aria-selected={openTab === section}
              aria-controls={`panel-${section}`}
              className={clsx(styles.tab, openTab === section && styles.tabCurrent)}
              onClick={() => setOpenTab(section)}
            >
              {section === "production" ? "Production & Consumption" : SECTION_LABEL[section]}
              {errorCount(section) > 0 && (
                <span className={styles.tabError}>
                  {errorCount(section)}
                  <span className="u-visually-hidden"> {errorCount(section) === 1 ? "problem" : "problems"}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {state.status === "error" && state.message && (
        <p className={styles.alert} role="alert">
          <Icon name="error" size={16} />
          <span>{state.message}</span>
        </p>
      )}

      <div key={state.at ?? "initial"} className={styles.panels}>
        {sections.map((section) => (
          <section
            key={section}
            id={`panel-${section}`}
            role={tabbed ? "tabpanel" : undefined}
            aria-labelledby={tabbed ? `tab-${section}` : undefined}
            hidden={tabbed && openTab !== section}
            className={styles.panel}
          >
            <Section section={section} values={values} errors={errors} options={options} mode={mode} />
          </section>
        ))}
      </div>

      {consumption && (
        // Outside the remounting panels, so the lines survive a refused submission.
        <section
          id="panel-production"
          role="tabpanel"
          aria-labelledby="tab-production"
          hidden={openTab !== "production"}
          className={styles.panel}
        >
          <ConsumptionEditor inputs={consumption.inputs} initial={consumption.initial} errors={consumptionErrors} onChange={() => setDirty(true)} />
        </section>
      )}

      <footer className={styles.footer}>
        <p className={styles.status} role="status" aria-live="polite">
          {dirty && !pending ? (
            <>
              <span className={styles.dirtyDot} aria-hidden="true" />
              Unsaved changes
            </>
          ) : state.status === "saved" ? (
            <>
              <Icon name="check-circle" size={16} className={styles.ok} />
              {state.message}
            </>
          ) : mode === "create" ? (
            "Saves an unpublished product with approval status Draft. Approval, price approval and publishing come later."
          ) : (
            "Nothing is approved or published from here."
          )}
        </p>
        <div className={styles.actions}>
          <Link href={cancelHref} className={styles.cancel}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={pending} iconLeft="check">
            {pending ? "Saving…" : mode === "create" ? "Save draft" : "Save changes"}
          </Button>
        </div>
      </footer>
    </form>
  );
}

const countIn = (errors: FieldErrors, section: ProductSection) => SECTION_FIELDS[section].filter((field) => errors[field]).length;

interface SectionProps {
  section: ProductSection;
  values: ProductFormValues;
  errors: FieldErrors;
  options: ProductFormOptions;
  mode: "create" | "edit";
}

function Section({ section, values, errors, options, mode }: SectionProps) {
  switch (section) {
    case "overview":
      return <Overview values={values} errors={errors} options={options} mode={mode} />;
    case "manufacturing":
      return <Manufacturing values={values} errors={errors} options={options} />;
    case "pricing":
      return <Pricing values={values} errors={errors} />;
    case "media":
      return <MediaFields values={values} errors={errors} options={options} />;
    case "model":
      return (
        <div className={styles.grid}>
          <Input name="modelUrl" label="Model file" technical maxLength={LIMITS.modelUrl} defaultValue={values.modelUrl} error={errors.modelUrl} hint="A verified file under /models/, e.g. /models/spur-gear-24t.stl. Leave empty for a product without a model." className={styles.wide} />
          <Select name="modelFormat" label="Format" defaultValue={values.modelFormat} error={errors.modelFormat} options={[{ value: "", label: "—" }, "stl", "obj", "glb", "gltf"].map((option) => (typeof option === "string" ? { value: option, label: option.toUpperCase() } : option))} />
          <p className={clsx(styles.note, styles.wide)}>
            <Icon name="info" size={14} />
            The launch assessment checks the file exists on this deployment, parses as a closed mesh and fits the approved build volume.
          </p>
        </div>
      );
    case "seo":
      return (
        <div className={styles.grid}>
          <Input name="seoTitle" label="Search title" maxLength={LIMITS.seoTitle} defaultValue={values.seoTitle} error={errors.seoTitle} hint="About 60 characters show in results; the brand is appended." className={styles.wide} />
          <Textarea name="seoDescription" label="Search description" rows={3} maxLength={LIMITS.seoDescription} defaultValue={values.seoDescription} error={errors.seoDescription} hint="About 160 characters show in results. Product facts only." className={styles.wide} />
        </div>
      );
  }
}

function Overview({ values, errors, options, mode }: Omit<SectionProps, "section">) {
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(mode === "edit" || Boolean(values.slug));

  return (
    <div className={styles.grid}>
      <Input
        name="name"
        label="Product name"
        required
        maxLength={LIMITS.name}
        defaultValue={values.name}
        error={errors.name}
        onChange={(event) => {
          if (!slugTouched) setSlug(slugify(event.currentTarget.value));
        }}
        className={styles.wide}
      />
      <Input name="sku" label="SKU" technical maxLength={LIMITS.sku} defaultValue={values.sku} error={errors.sku} hint="Assigned by the business, e.g. RG-GEAR-024. Leave empty until decided; quote-only products need none." />
      <Input
        name="slug"
        label="URL segment"
        technical
        maxLength={LIMITS.slug}
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.currentTarget.value);
        }}
        error={errors.slug}
        hint={mode === "edit" ? "Changing it breaks existing links to this product." : "Made from the name; edit if needed."}
      />
      <Select
        name="categoryId"
        label="Category"
        required
        defaultValue={values.categoryId}
        error={errors.categoryId}
        placeholder="Choose a category"
        options={options.categories.map((category) => ({
          value: String(category.id),
          label: category.browseLabel && category.browseLabel !== category.label ? `${category.browseLabel} › ${category.label}` : category.label,
        }))}
        hint={options.categories.length === 0 ? "No categories exist yet. Create one under Catalog › Categories." : undefined}
        className={styles.wide}
      />
      <Input name="summary" label="Short summary" required maxLength={LIMITS.summary} defaultValue={values.summary} error={errors.summary} hint="One short technical line. Used by search." className={styles.wide} />
      <Textarea name="description" label="Description" rows={3} maxLength={LIMITS.description} defaultValue={values.description} error={errors.description} hint="Two sentences at most. Engineering-plain." className={styles.wide} />
      <Textarea name="customers" label="Target customers" rows={2} maxLength={LIMITS.customers} defaultValue={values.customers} error={errors.customers} hint="One per line. Stays proposed until the commercial approval is recorded." />
      <Textarea name="applications" label="Applications" rows={2} maxLength={LIMITS.applications} defaultValue={values.applications} error={errors.applications} hint="One per line." />
      <Textarea name="useCase" label="Use case" rows={2} maxLength={LIMITS.useCase} defaultValue={values.useCase} error={errors.useCase} hint="What it is intended for, in one sentence." className={styles.wide} />
    </div>
  );
}

function Manufacturing({ values, errors, options }: Omit<SectionProps, "section" | "mode">) {
  const [technology, setTechnology] = useState(values.technology);
  const [materialId, setMaterialId] = useState(values.materialId);
  const [qualities, setQualities] = useState<string[]>(values.qualities);

  const tech = options.technologies.find((row) => row.value === technology);
  const material = options.materials.find((row) => String(row.id) === materialId);
  const comingSoon = [tech, material].filter((row) => row?.status === "COMING_SOON").map((row) => row!.label);

  return (
    <div className={styles.grid}>
      <Select
        name="technology"
        label="Technology"
        required
        value={technology}
        onChange={(event) => setTechnology(event.currentTarget.value)}
        error={errors.technology}
        placeholder="Choose a process"
        options={options.technologies.map((row) => ({ value: row.value, label: `${row.label}${CAPABILITY_SUFFIX[row.status]}` }))}
      />
      <Select
        name="materialId"
        label="Material"
        required
        value={materialId}
        onChange={(event) => setMaterialId(event.currentTarget.value)}
        error={errors.materialId}
        placeholder={options.materials.length === 0 ? "No materials available" : "Choose a material"}
        options={options.materials.map((row) => ({ value: String(row.id), label: `${row.label}${CAPABILITY_SUFFIX[row.status]}` }))}
      />
      <Select
        name="color"
        label="Colour"
        required
        defaultValue={values.color}
        error={errors.color}
        placeholder="Choose a colour"
        options={options.colours}
        hint="Approved production colours only."
      />

      <fieldset className={clsx(styles.fieldset, errors.qualities && styles.fieldsetError)} aria-describedby={errors.qualities ? "qualities-error" : undefined}>
        <legend className={styles.legend}>Layer heights offered</legend>
        {options.qualities.length === 0 ? (
          <p className={styles.note}>No layer height is approved yet.</p>
        ) : (
          options.qualities.map((quality) => (
            <Checkbox
              key={quality.value}
              name="qualities"
              value={quality.value}
              label={`${quality.label} · ${quality.layerHeight}`}
              checked={qualities.includes(quality.value)}
              onChange={(event) => {
                const on = event.currentTarget.checked;
                setQualities((current) => (on ? [...current, quality.value] : current.filter((value) => value !== quality.value)));
              }}
            />
          ))
        )}
        {errors.qualities && (
          <p id="qualities-error" className={styles.fieldError} role="alert">
            <Icon name="error" size={14} />
            {errors.qualities}
          </p>
        )}
      </fieldset>

      {comingSoon.length > 0 && (
        <p className={clsx(styles.warning, styles.wide)} role="status">
          <Icon name="alert" size={16} />
          <span>
            {comingSoon.join(" and ")} {comingSoon.length === 1 ? "is" : "are"} Coming Soon. The product can be kept as a draft for the
            roadmap, but it cannot be published, ordered or become launch ready until {comingSoon.length === 1 ? "it is" : "they are"} approved.
          </span>
        </p>
      )}
      {options.comingSoonFinishes.length > 0 && (
        <p className={clsx(styles.note, styles.wide)}>
          <Icon name="info" size={14} />
          Finishes coming soon: {options.comingSoonFinishes.join(", ")}. They are not product options yet.
        </p>
      )}
    </div>
  );
}

function Pricing({ values, errors }: Pick<SectionProps, "values" | "errors">) {
  const [price, setPrice] = useState(values.price);
  const quote = price.trim() === "0" || price.trim() === "";

  return (
    <div className={styles.grid}>
      <Select name="productClass" label="Product class" defaultValue={values.productClass} error={errors.productClass} options={PRODUCT_CLASSES} hint="Standard needs a SKU and approved price; quote-only needs neither." />
      <Select name="pricingModel" label="Pricing model" defaultValue={values.pricingModel} error={errors.pricingModel} options={PRICING_MODELS} />
      <Input
        name="price"
        label="Price"
        inputMode="numeric"
        technical
        suffix="INR"
        value={price}
        onChange={(event) => setPrice(event.currentTarget.value)}
        error={errors.price}
        hint={quote ? "0 means quote-only: priced from the customer's geometry." : "Whole rupees. Stays provisional until a price approval matches it."}
      />
      <Select
        name="availability"
        label="Availability label"
        defaultValue={values.availability}
        error={errors.availability}
        options={[
          { value: "made-to-order", label: "Made to order" },
          { value: "in-stock", label: "In stock (a label, not a stock count)" },
        ]}
      />
      <p className={clsx(styles.note, styles.wide)}>
        <Icon name="info" size={14} />
        Price status is derived: {quote ? "quote only" : "provisional"}. It becomes approved only through a recorded price approval.
      </p>
    </div>
  );
}

function MediaFields({ values, errors, options }: Omit<SectionProps, "section" | "mode">) {
  return (
    <div className={styles.grid}>
      <Input name="visualSrc" label="Product image" technical maxLength={LIMITS.visualSrc} defaultValue={values.visualSrc} error={errors.visualSrc} hint="A real photo or approved render under /catalog/, e.g. /catalog/spur-gear-24t/front.jpg." className={styles.wide} />
      <Input name="visualAlt" label="Alt text" maxLength={LIMITS.visualAlt} defaultValue={values.visualAlt} error={errors.visualAlt} hint="Describe the part, not the photo." />
      <Select
        name="visualKind"
        label="Image kind"
        defaultValue={values.visualKind}
        error={errors.visualKind}
        options={[
          { value: "", label: "—" },
          { value: "photo", label: "Photograph of the product" },
          { value: "render", label: "Render from the product's model" },
        ]}
      />
      <Select
        name="visualRequirement"
        label="Required for launch"
        defaultValue={values.visualRequirement}
        error={errors.visualRequirement}
        options={[
          { value: "", label: "Not decided yet" },
          { value: "REAL_PHOTO", label: "Real product photo" },
          { value: "APPROVED_RENDER", label: "Approved render" },
        ]}
      />
      <Select
        name="imageId"
        label="Media library image"
        defaultValue={values.imageId}
        error={errors.imageId}
        options={[{ value: "", label: options.media.length === 0 ? "Library is empty" : "None" }, ...options.media.map((row) => ({ value: String(row.id), label: row.label }))]}
      />
      <Textarea name="renderSpecification" label="Render specification" rows={2} maxLength={LIMITS.renderSpecification} defaultValue={values.renderSpecification} error={errors.renderSpecification} hint="For a render: what it must show. Not a claim that one exists." className={styles.wide} />
      <p className={clsx(styles.note, styles.wide)}>
        <Icon name="info" size={14} />
        Setting or changing the image does not approve it; replacing an approved image clears its media approval.
      </p>
    </div>
  );
}

