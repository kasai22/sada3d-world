"use client";

import { useState } from "react";

import {
  MaterialCard,
  OrderSummary,
  PriceSummary,
  type QuoteState,
} from "@/components/commerce";
import { Button } from "@/components/core";

import styles from "./page.module.css";

const MATERIALS = [
  {
    name: "PLA",
    code: "Polylactic acid",
    description:
      "The default. Dimensionally stable, sharp detail, matte finish.",
    properties: { strength: 3, flexibility: 2, heat: 2 },
    colors: ["#F4F6F8", "#050506", "#FF6B00", "#6C737C"],
    multiplier: "1.0",
  },
  {
    name: "PETG",
    code: "Glycol-modified PET",
    description: "Tougher and chemically resistant. Semi-gloss surface.",
    properties: { strength: 4, flexibility: 3, heat: 4 },
    colors: ["#F4F6F8", "#050506", "#4DA3FF"],
    multiplier: "1.2",
  },
  {
    name: "TPU",
    code: "Thermoplastic polyurethane",
    description: "Elastomeric. Gaskets, dampers, protective housings.",
    properties: { strength: 3, flexibility: 5, heat: 3 },
    colors: ["#050506", "#FF6B00"],
    multiplier: "1.6",
  },
] as const;

const QUOTE_STATES: readonly QuoteState[] = [
  "valid",
  "calculating",
  "updating",
  "invalid",
  "error",
];

const QUOTE_MESSAGE: Partial<Record<QuoteState, string>> = {
  invalid: "Wall thickness below 0.8 mm in 3 regions. Thicken and re-upload.",
  error: "Pricing service unavailable. Retry in a moment.",
};

export function CommerceGallery() {
  const [material, setMaterial] = useState("PLA");
  const [quote, setQuote] = useState<QuoteState>("valid");

  return (
    <>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Material card</span>
      </div>
      <div className={styles.structureGrid}>
        {MATERIALS.map((entry) => (
          <MaterialCard
            key={entry.name}
            {...entry}
            selected={material === entry.name}
            onSelect={() => setMaterial(entry.name)}
          />
        ))}
      </div>

      <div className={styles.row} style={{ marginTop: "var(--spacing-9)" }}>
        <span className={styles.rowLabel}>Price summary · quote states</span>
        {QUOTE_STATES.map((state) => (
          <Button
            key={state}
            size="sm"
            variant={quote === state ? "technical" : "ghost"}
            onClick={() => setQuote(state)}
          >
            {state}
          </Button>
        ))}
      </div>

      <div className={styles.structureGrid}>
        <PriceSummary
          state={quote}
          price="₹387"
          message={QUOTE_MESSAGE[quote]}
          note="Excludes GST and shipping"
          analysis={[
            { label: "Volume", value: "48.3 cm³" },
            { label: "Weight", value: "42.6 G" },
            { label: "Print time", value: "03:24:00" },
            { label: "Material", value: material },
          ]}
        />

        <OrderSummary
          total="₹1,036"
          totals={[
            { label: "Subtotal", value: "₹798" },
            { label: "Shipping", value: "₹90" },
            { label: "GST (18%)", value: "₹148" },
          ]}
          items={[
            {
              id: "1",
              name: "Precision Gear",
              spec: "PLA / BLACK / 0.16 MM",
              quantity: 2,
              price: "₹798",
            },
          ]}
        />

        <OrderSummary items={[]} />
      </div>
    </>
  );
}
