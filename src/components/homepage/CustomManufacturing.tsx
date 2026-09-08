import { Button, Tag } from "@/components/core";
import { Panel, SpecTable } from "@/components/structure";
import { WORKFLOW } from "@/content/home";
import styles from "./CustomManufacturing.module.css";

/**
 * 03 — Custom manufacturing.
 *
 * The readout is a worked example, not a live quote. It is labelled as such and
 * reuses Panel and SpecTable rather than introducing another readout pattern;
 * the real one is PriceSummary, which arrives with the configurator in Phase 8.
 */
export function CustomManufacturing() {
  return (
    <section
      className={`bg-engineering ${styles.section}`}
      aria-labelledby="custom-title"
    >
      <div className={`u-container ${styles.layout}`}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowRule} aria-hidden="true" />
            Custom manufacturing
          </p>

          <h2 id="custom-title" className={styles.headline}>
            Your design.
            <br />
            Our machines.
            <br />
            <span className={styles.headlineAccent}>Physical reality.</span>
          </h2>

          <p className={styles.lead}>
            Upload your model, configure the manufacturing process, and receive
            a precision-made physical product.
          </p>

          <div className={styles.actions}>
            <Button href="/custom-print" size="lg" iconLeft="upload">
              Upload design
            </Button>
            <Button href="/how-it-works" size="lg" variant="secondary">
              How it works
            </Button>
          </div>

          <div className={styles.flow}>
            {WORKFLOW.map((step, index) => (
              <span key={step.index} className={styles.flowStep}>
                {index > 0 && (
                  <span className={styles.flowArrow} aria-hidden="true" />
                )}
                {step.name}
              </span>
            ))}
          </div>
        </div>

        <Panel technical title="Part analysis" meta="PART_00492">
          <div className={styles.readout}>
            <SpecTable
              caption="Example part analysis"
              highlight={["Est. print time"]}
              rows={[
                { label: "Volume", value: "48.3 cm³" },
                { label: "Weight", value: "42.6 G" },
                { label: "Material", value: "PLA" },
                { label: "Layer height", value: "0.16 MM" },
                { label: "Infill", value: "20%" },
                { label: "Est. print time", value: "03:24:00" },
              ]}
            />

            <div className={styles.price}>
              <span className={styles.priceLabel}>Estimated price</span>
              <span className={styles.priceValue}>₹387</span>
            </div>

            <div className={styles.disclaimer}>
              <Tag tone="neutral">Example</Tag>
              <p className={styles.disclaimerText}>
                Figures are illustrative. Your quote is calculated from your own
                geometry.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
