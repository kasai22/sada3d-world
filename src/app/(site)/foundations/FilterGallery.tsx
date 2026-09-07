"use client";

import { useState } from "react";

import { FilterTree, type FilterGroup } from "@/components/navigation";
import { Tag } from "@/components/core";

import styles from "./page.module.css";

/**
 * The marketplace facet structure. Phase 5 sources this from the CMS; here it
 * exercises all three nesting levels and the indeterminate parent state.
 */
const GROUPS: readonly FilterGroup[] = [
  {
    key: "category",
    label: "Category",
    options: [
      {
        value: "functional",
        label: "Functional",
        count: 128,
        defaultOpen: true,
        children: [
          {
            value: "mechanical",
            label: "Mechanical",
            count: 64,
            children: [
              { value: "gears", label: "Gears", count: 22 },
              { value: "brackets", label: "Brackets", count: 18 },
              { value: "tools", label: "Tools", count: 24 },
            ],
          },
          { value: "fasteners", label: "Fasteners", count: 31 },
        ],
      },
      {
        value: "automotive",
        label: "Automotive",
        count: 38,
        children: [
          { value: "interior", label: "Interior", count: 12 },
          { value: "exterior", label: "Exterior", count: 14 },
          { value: "components", label: "Components", count: 12 },
        ],
      },
      {
        value: "lifestyle",
        label: "Lifestyle",
        count: 51,
        children: [
          { value: "home", label: "Home", count: 20 },
          { value: "decor", label: "Decor", count: 16 },
          { value: "organization", label: "Organization", count: 15 },
        ],
      },
    ],
  },
  {
    key: "material",
    label: "Material",
    options: [
      { value: "pla", label: "PLA", count: 120 },
      { value: "petg", label: "PETG", count: 64 },
      { value: "abs", label: "ABS", count: 31 },
      { value: "tpu", label: "TPU", count: 18 },
      { value: "resin", label: "Resin", count: 27 },
    ],
  },
  {
    key: "technology",
    label: "Print technology",
    options: [
      { value: "fdm", label: "FDM", count: 180 },
      { value: "sla", label: "SLA", count: 44 },
      { value: "sls", label: "SLS", count: 12 },
    ],
  },
  {
    key: "availability",
    label: "Availability",
    defaultOpen: false,
    options: [
      { value: "in-stock", label: "In stock", count: 204 },
      { value: "made-to-order", label: "Made to order", count: 32 },
    ],
  },
];

export function FilterGallery() {
  const [selected, setSelected] = useState<string[]>(["gears", "pla"]);

  const toggle = (_groupKey: string, value: string) =>
    setSelected((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );

  return (
    <div className={styles.filterLayout}>
      <FilterTree groups={GROUPS} selected={selected} onToggle={toggle} />

      <div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>
            Active filters · {selected.length}
          </span>
          {selected.map((value) => (
            <Tag
              key={value}
              tone="accent"
              removeLabel={`Remove filter ${value}`}
              onRemove={() =>
                setSelected((current) => current.filter((e) => e !== value))
              }
            >
              {value}
            </Tag>
          ))}
          {selected.length === 0 && (
            <span className="t-body-sm">No filters applied.</span>
          )}
        </div>
      </div>
    </div>
  );
}
