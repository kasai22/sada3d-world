import type { Metadata } from "next";

import { Button, Icon, IconButton, StatusDot, Tag } from "@/components/core";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Foundations",
  description:
    "Design system foundations — colour, type, geometry, background modes and motion.",
  robots: { index: false, follow: false },
};

const METAL = [
  ["Void", "#050506"],
  ["Graphite", "#0A0B0D"],
  ["Carbon", "#121417"],
  ["Carbon 2", "#191C21"],
  ["Titanium", "#262A30"],
  ["Titanium 2", "#343941"],
  ["Steel", "#6C737C"],
  ["Silver", "#A9B0B9"],
  ["Platinum", "#D7DBE0"],
  ["White", "#F4F6F8"],
] as const;

const ORANGE = [
  ["Orange 100", "#FFE2CC"],
  ["Orange 200", "#FFC199"],
  ["Orange 300", "#FF9C5C"],
  ["Orange 400", "#FF8226"],
  ["Orange 500", "#FF6B00"],
  ["Orange 600", "#E25A00"],
  ["Orange 700", "#B84800"],
  ["Orange 800", "#7A2F00"],
  ["Orange 900", "#3D1800"],
] as const;

const STATUS = [
  ["Success", "#3ED598"],
  ["Warning", "#FFC34D"],
  ["Danger", "#FF4D4D"],
  ["Info", "#4DA3FF"],
] as const;

const GEOMETRY = [
  ["Chip", "var(--radius-chip)", "2 PX"],
  ["Button", "var(--radius-button)", "3 PX"],
  ["Card", "var(--radius-card)", "4 PX"],
  ["Media", "var(--radius-lg)", "6 PX"],
  ["Technical", "var(--radius-panel-technical)", "0 PX"],
] as const;

const MOTION = [
  ["Instant", "80 MS", "12%"],
  ["Fast", "140 MS", "22%"],
  ["Medium", "260 MS", "40%"],
  ["Slow", "480 MS", "64%"],
  ["Cinematic", "900 MS", "100%"],
] as const;

function Swatches({
  title,
  items,
}: {
  title: string;
  items: readonly (readonly [string, string])[];
}) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h2 className="t-h3">{title}</h2>
        <span className="orange-line" aria-hidden="true" />
      </div>
      <ul className={styles.swatches}>
        {items.map(([name, value]) => (
          <li key={name} className={styles.swatch}>
            <div className={styles.chip} style={{ background: value }} />
            <div className={styles.swatchMeta}>
              <span className={styles.swatchName}>{name}</span>
              <span className={styles.swatchValue}>{value}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function FoundationsPage() {
  return (
    <main className={`u-container ${styles.page}`}>
      <header className={styles.header}>
        <p className="t-eyebrow">Design system</p>
        <h1 className="t-display">Foundations.</h1>
        <p className="t-body-lg">
          Black is the machine. White is the information. Orange is the signal.
        </p>
      </header>

      <Swatches title="Metal scale" items={METAL} />
      <Swatches title="Titanium orange" items={ORANGE} />
      <Swatches title="Status" items={STATUS} />


      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="t-h3">Core components</h2>
          <span className="orange-line" aria-hidden="true" />
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Button · variants</span>
          <Button variant="primary">Start printing</Button>
          <Button variant="secondary">Explore designs</Button>
          <Button variant="tertiary">View part</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="technical" iconLeft="scan">Run geometry check</Button>
          <Button variant="destructive" iconLeft="trash">Remove</Button>
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Button · sizes and states</span>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg" iconRight="arrow-right">Large</Button>
          <Button loading>Calculating</Button>
          <Button success>Added to cart</Button>
          <Button disabled>Unavailable</Button>
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Icon button</span>
          <IconButton icon="rotate-3d" label="Rotate" />
          <IconButton icon="move-3d" label="Pan" />
          <IconButton icon="layers" label="Exploded view" active />
          <IconButton icon="ruler" label="Measure" variant="outline" />
          <IconButton icon="maximize" label="Fullscreen" variant="outline" />
          <IconButton icon="reset" label="Reset view" disabled />
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Tag</span>
          <Tag>PLA</Tag>
          <Tag tone="accent">0.16 MM</Tag>
          <Tag tone="success" icon="check">In stock</Tag>
          <Tag tone="warning" icon="alert">Low stock</Tag>
          <Tag tone="danger" icon="error">Geometry error</Tag>
          <Tag tone="info" icon="info">Made to order</Tag>
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Status dot</span>
          <StatusDot status="queued" label="Queued" />
          <StatusDot status="processing" label="File processed" />
          <StatusDot status="printing" label="Printing" pulse />
          <StatusDot status="complete" label="Complete" />
          <StatusDot status="paused" label="Paused" />
          <StatusDot status="failed" label="Failed" />
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Icon · 14 / 16 / 20 / 24</span>
          <Icon name="box" size={14} />
          <Icon name="cpu" size={16} />
          <Icon name="upload" size={20} />
          <Icon name="package" size={24} />
          <Icon name="thermometer" size={24} />
          <Icon name="wrench" size={24} />
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="t-h3">Type</h2>
          <span className="orange-line" aria-hidden="true" />
        </div>
        <dl className={styles.typeRows}>
          <div className={styles.typeRow}>
            <dt>Display · Saira</dt>
            <dd>
              <span className="t-display">Manufacturing.</span>
            </dd>
          </div>
          <div className={styles.typeRow}>
            <dt>H2 · Saira</dt>
            <dd>
              <span className="t-h2">Part configuration</span>
            </dd>
          </div>
          <div className={styles.typeRow}>
            <dt>Body · Archivo</dt>
            <dd>
              <span className="t-body">
                Upload a model, choose your material and configure print quality.
              </span>
            </dd>
          </div>
          <div className={styles.typeRow}>
            <dt>Label · Archivo</dt>
            <dd>
              <span className="t-label">Est. print time</span>
            </dd>
          </div>
          <div className={styles.typeRow}>
            <dt>Technical · Mono</dt>
            <dd>
              <span className="t-technical">
                PART_00492 · SADA-FDM-07 · 80 × 40 × 20 MM · 02:48:12 · ±0.1 MM
              </span>
            </dd>
          </div>
          <div className={styles.typeRow}>
            <dt>Metric · Mono</dt>
            <dd>
              <span className="t-metric">₹1,036</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="t-h3">Background modes</h2>
          <span className="orange-line" aria-hidden="true" />
        </div>
        <div className={styles.modes}>
          <div className={`bg-hero ${styles.mode}`}>
            <span className="t-label">Hero</span>
            <span className="t-technical">96 PX GRID · 5.5%</span>
          </div>
          <div className={`bg-commerce ${styles.mode}`}>
            <span className="t-label">Commerce</span>
            <span className="t-technical">FLAT GRAPHITE</span>
          </div>
          <div className={`bg-engineering ${styles.mode}`}>
            <span className="t-label">Engineering</span>
            <span className="t-technical">32 PX GRID · 3.2%</span>
          </div>
          <div className={`bg-viewer ${styles.mode}`}>
            <span className="t-label">Viewer</span>
            <span className="t-technical">RADIAL STAGE</span>
          </div>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="t-h3">Geometry</h2>
          <span className="orange-line" aria-hidden="true" />
        </div>
        <div className={styles.geometry}>
          {GEOMETRY.map(([name, radius, label]) => (
            <div key={name} className={styles.geoSample} style={{ borderRadius: radius }}>
              <span>
                {name} · {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="t-h3">Motion</h2>
          <span className="orange-line" aria-hidden="true" />
        </div>
        <div className={styles.motionRows}>
          {MOTION.map(([name, duration, width]) => (
            <div key={name} className={styles.motionRow}>
              <span>
                {name} · {duration}
              </span>
              <span className={styles.bar} style={{ width }} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
