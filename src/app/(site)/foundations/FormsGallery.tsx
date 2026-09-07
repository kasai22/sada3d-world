"use client";

import { useState } from "react";

import {
  Checkbox,
  FileUpload,
  Input,
  QuantityStepper,
  Radio,
  RangeSlider,
  Select,
  Switch,
} from "@/components/forms";
import { Tag } from "@/components/core";

import styles from "./page.module.css";

/**
 * Live specimen for the forms group. Client-side because the controls are
 * demonstrated in their real controlled form, with every state visible.
 */
export function FormsGallery() {
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);
  const [material, setMaterial] = useState("PLA");
  const [inStock, setInStock] = useState(true);
  const [madeToOrder, setMadeToOrder] = useState(false);
  const [rush, setRush] = useState(false);
  const [model, setModel] = useState<File | null>(null);
  const [filters, setFilters] = useState<string[]>(["PLA", "FDM"]);

  return (
    <>
      <div className={styles.fieldGrid}>
        <Input label="Part name" placeholder="Bracket, revision B" />
        <Input
          label="Layer height"
          defaultValue="0.16"
          suffix="MM"
          technical
          icon="ruler"
          hint="Finer layers increase print time."
        />
        <Input
          label="Email"
          type="email"
          defaultValue="not-an-address"
          error="Enter a valid email address."
        />
        <Input label="Machine" defaultValue="SADA-FDM-07" technical disabled />
        <Select
          label="Material"
          value={material}
          onChange={(event) => setMaterial(event.target.value)}
          options={["PLA", "PETG", "ABS", "TPU", "Resin"]}
          hint="Material sets the price multiplier."
        />
        <Select
          label="Print technology"
          options={["FDM", "SLA", "SLS"]}
          error="SLS is unavailable for this geometry."
        />
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Choice · checkbox, radio, switch</span>
      </div>
      <div className={styles.fieldGrid}>
        <div>
          <Checkbox
            label="In stock"
            count={204}
            checked={inStock}
            onChange={(event) => setInStock(event.target.checked)}
          />
          <Checkbox
            label="Made to order"
            count={32}
            checked={madeToOrder}
            onChange={(event) => setMadeToOrder(event.target.checked)}
          />
          <Checkbox label="Functional" count={128} indeterminate />
          <Checkbox label="Discontinued" count={0} disabled />
        </div>
        <div>
          <Radio
            name="quality"
            label="Draft · 0.28 MM"
            checked={!rush}
            onChange={() => setRush(false)}
          />
          <Radio
            name="quality"
            label="Standard · 0.16 MM"
            checked={rush}
            onChange={() => setRush(true)}
          />
          <Radio name="quality" label="Fine · 0.08 MM" disabled />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <Switch label="Support material" defaultChecked />
          <Switch label="Vapour smoothing" />
          <Switch label="Priority queue" disabled />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Range and quantity</span>
      </div>
      <div className={styles.fieldGrid}>
        <RangeSlider
          label="Infill"
          value={infill}
          min={0}
          max={100}
          step={5}
          format={(value) => `${value}%`}
          onChange={(event) => setInfill(Number(event.target.value))}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
          <span className="t-label" style={{ color: "var(--text-muted)" }}>
            Quantity
          </span>
          <QuantityStepper value={quantity} max={99} onChange={setQuantity} />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Filter chips</span>
        {filters.map((filter) => (
          <Tag
            key={filter}
            tone="accent"
            removeLabel={`Remove filter ${filter}`}
            onRemove={() => setFilters((current) => current.filter((f) => f !== filter))}
          >
            {filter}
          </Tag>
        ))}
        {filters.length === 0 && (
          <span className="t-body-sm">No filters applied.</span>
        )}
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>File upload</span>
      </div>
      <FileUpload file={model} onFileChange={setModel} />
    </>
  );
}
