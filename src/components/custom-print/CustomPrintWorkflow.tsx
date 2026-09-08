"use client";

import { useEffect, useId, useRef, useState } from "react";

import { MaterialCard } from "@/components/commerce";
import { Button, Icon, Tag } from "@/components/core";
import { FileUpload, QuantityStepper } from "@/components/forms";
import { Stepper } from "@/components/structure";
import { ModelFileError, formatBytes } from "@/lib/custom-print/inspect";
import {
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
  finishOption,
  materialOption,
  qualityOption,
} from "@/lib/custom-print/options";
import { QuoteSummary } from "@/components/quote";
import {
  pricingSignature,
  requestQuote,
} from "@/lib/custom-print/quote";
import type { QuoteResponse } from "@/lib/pricing/types";
import { forgetModelFile, rememberModelFile } from "@/lib/custom-print/modelBlobs";
import { modelStorage } from "@/lib/custom-print/storage";
import {
  ACCEPTED_EXTENSIONS,
  EMPTY_CONFIGURATION,
  MAX_MODEL_BYTES,
  MAX_QUANTITY,
  MIN_QUANTITY,
  STEPS,
  type CustomPrintConfiguration,
  type StepId,
  type UploadedModel,
} from "@/lib/custom-print/types";
import {
  blockedReason,
  clearConfiguration,
  furthestReachableStep,
  loadConfiguration,
  saveConfiguration,
  stepAt,
  stepIndex,
} from "@/lib/custom-print/workflow";

import { ChoiceList } from "./ChoiceList";
import { ModelStage } from "./ModelStage";
import styles from "./CustomPrintWorkflow.module.css";

/**
 * The custom manufacturing workflow.
 *
 * Owns model identity and configuration for the whole flow — steps read and
 * write one state object rather than holding pieces of their own. Rendering
 * (Phase 9), pricing (Phase 8) and durable storage (Phase 16) each sit behind a
 * seam in lib/custom-print and are not reached into from here.
 */
export function CustomPrintWorkflow() {
  const [configuration, setConfiguration] =
    useState<CustomPrintConfiguration>(EMPTY_CONFIGURATION);
  const [step, setStep] = useState<StepId>("upload");
  const [restored, setRestored] = useState(false);

  /*
   * Set while the customer is choosing a replacement. The existing model stays
   * in the configuration until a valid new one arrives, so cancelling by
   * navigating away leaves the original in place.
   */
  const [replacing, setReplacing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  /*
   * The configuration a quote was produced from. Comparing it against the
   * current one is what stops a figure describing a configuration the customer
   * has since changed.
   */
  const [quotedSignature, setQuotedSignature] = useState<string | null>(null);

  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /*
   * Restore selections made earlier in this tab. Runs once, after mount.
   *
   * This cannot be a lazy useState initialiser: that runs during render, which
   * happens on the server too, where sessionStorage does not exist. The server
   * would render step 01 and the client would render step 03 from storage — a
   * hydration mismatch. Reading after mount means both start from the same
   * empty state and the restore is applied as an update.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- hydration, see above */
  useEffect(() => {
    const stored = loadConfiguration();
    setConfiguration(stored);
    setStep(stepAt(furthestReachableStep(stored)));
    setRestored(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist after the initial restore, so an empty default never overwrites it.
  useEffect(() => {
    if (restored) saveConfiguration(configuration);
  }, [configuration, restored]);

  const index = stepIndex(step);
  const definition = STEPS[index];
  const reachable = furthestReachableStep(configuration);

  function goTo(next: StepId) {
    setStep(next);
    setBlocked(null);
    // Leaving the upload step abandons a replacement in progress.
    if (next !== "upload") setReplacing(false);
    // Move focus to the new step's heading so the change is announced and
    // keyboard users continue from the right place.
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function onContinue() {
    const reason = blockedReason(step, configuration);
    if (reason) {
      setBlocked(reason);
      // Send focus to the controls that need attention.
      panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
      return;
    }
    if (index < STEPS.length - 1) goTo(stepAt(index + 1));
  }

  async function onFileChange(file: File | null) {
    setFileError(null);
    setBlocked(null);

    if (!file) {
      forgetModelFile();
      setConfiguration((current) => ({ ...current, model: undefined }));
      return;
    }

    setPreparing(true);
    try {
      const model: UploadedModel = await modelStorage.prepare(file);
      // The bytes stay in memory for the viewer only; the workflow continues to
      // persist identity alone. Registering replaces and revokes any previous
      // object URL.
      rememberModelFile(model.id, file);
      setConfiguration((current) => ({ ...current, model }));
      setReplacing(false);
    } catch (cause) {
      setFileError(
        cause instanceof ModelFileError
          ? cause.message
          : "The file couldn't be prepared. Try again.",
      );
    } finally {
      setPreparing(false);
    }
  }

  async function onRequestQuote() {
    setQuoting(true);
    // Captured before awaiting, so the quote is tied to the configuration it
    // was actually priced from.
    const signature = pricingSignature(configuration);
    try {
      setQuote(await requestQuote(configuration));
      setQuotedSignature(signature);
    } finally {
      setQuoting(false);
    }
  }

  function onStartOver() {
    forgetModelFile();
    setReplacing(false);
    clearConfiguration();
    setConfiguration(EMPTY_CONFIGURATION);
    setQuote(null);
    setQuotedSignature(null);
    goTo("upload");
  }

  const quoteIsStale =
    quote !== null && quotedSignature !== pricingSignature(configuration);

  const material = materialOption(configuration.material);
  const quality = qualityOption(configuration.quality);
  const finish = finishOption(configuration.finish);

  return (
    <div className={styles.workflow}>
      <div className={styles.stepper}>
        <Stepper
          steps={STEPS.map((entry) => entry.label)}
          current={index}
          label="Custom print configuration"
          onSelect={(target) => {
            // Completed steps stay navigable; steps that depend on missing
            // values do not.
            if (target <= reachable) goTo(stepAt(target));
          }}
        />
      </div>

      <div className={styles.layout}>
        <div className={styles.stageColumn}>
          {configuration.model && !replacing ? (
            <ModelStage
              model={configuration.model}
              onReplace={() => {
                setReplacing(true);
                setStep("upload");
              }}
              onRemove={() => {
                forgetModelFile();
                setReplacing(false);
                setConfiguration((current) => ({ ...current, model: undefined }));
                goTo("upload");
              }}
            />
          ) : (
            <FileUpload
              fill
              accept={ACCEPTED_EXTENSIONS}
              maxBytes={MAX_MODEL_BYTES}
              file={null}
              disabled={preparing}
              onFileChange={onFileChange}
            />
          )}
        </div>

        <div className={styles.panel} ref={panelRef}>
          <div className={styles.panelHead}>
            <p className={styles.stepIndex}>
              <span className={styles.stepIndexRule} aria-hidden="true" />
              Step {String(index + 1).padStart(2, "0")} of{" "}
              {String(STEPS.length).padStart(2, "0")}
            </p>
            <h2 className={styles.title} tabIndex={-1} ref={headingRef}>
              {definition?.title}
            </h2>
            <p className={styles.intro}>{definition?.intro}</p>
          </div>

          <div className={styles.content}>
            {step === "upload" && (
              <>
                {preparing && (
                  <p className={styles.notice}>
                    <span className={styles.noticeGlyph}>
                      <Icon name="loader" size={16} />
                    </span>
                    Reading the file.
                  </p>
                )}

                {fileError && (
                  <p className={styles.message} role="alert">
                    <Icon name="error" size={14} />
                    {fileError}
                  </p>
                )}

                <div className={styles.formats}>
                  <span>Supported: STL · STEP · OBJ</span>
                  <span>Max {formatBytes(MAX_MODEL_BYTES)}</span>
                </div>

                <p className={styles.notice}>
                  <span className={styles.noticeGlyph}>
                    <Icon name="info" size={16} />
                  </span>
                  Your file stays in this browser. Nothing is uploaded to a
                  server in this preview.
                </p>
              </>
            )}

            {step === "material" && (
              <>
                <div className={styles.materials}>
                  {MATERIAL_OPTIONS.map((option) => (
                    <MaterialCard
                      key={option.value}
                      name={option.name}
                      code={option.code}
                      description={option.description}
                      properties={option.properties}
                      colors={option.colors}
                      selected={configuration.material === option.value}
                      onSelect={() => {
                        setBlocked(null);
                        setConfiguration((current) => ({
                          ...current,
                          material: option.value,
                        }));
                      }}
                    />
                  ))}
                </div>
                <p className={styles.notice}>
                  <span className={styles.noticeGlyph}>
                    <Icon name="info" size={16} />
                  </span>
                  These are the configuration options offered. Compatibility
                  with your specific geometry is confirmed during manufacturing
                  review.
                </p>
              </>
            )}

            {step === "quality" && (
              <ChoiceList
                legend="Print quality"
                choices={QUALITY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  detail: option.layerHeight,
                  description: option.description,
                }))}
                value={configuration.quality}
                onChange={(value) => {
                  setBlocked(null);
                  setConfiguration((current) => ({ ...current, quality: value }));
                }}
                describedBy={blocked ? messageId : undefined}
                invalid={Boolean(blocked)}
              />
            )}

            {step === "finish" && (
              <>
                <ChoiceList
                  legend="Finish"
                  choices={FINISH_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                  }))}
                  value={configuration.finish}
                  onChange={(value) => {
                    setBlocked(null);
                    setConfiguration((current) => ({ ...current, finish: value }));
                  }}
                  describedBy={blocked ? messageId : undefined}
                  invalid={Boolean(blocked)}
                />

                <div className={styles.quantityField}>
                  <span className={styles.quantityLabel}>Quantity</span>
                  <QuantityStepper
                    value={configuration.quantity}
                    min={MIN_QUANTITY}
                    max={MAX_QUANTITY}
                    onChange={(quantity) =>
                      setConfiguration((current) => ({ ...current, quantity }))
                    }
                    label="Quantity of parts"
                  />
                </div>
              </>
            )}

            {step === "review" && (
              <>
                <dl>
                  {[
                    {
                      key: "Model",
                      value: configuration.model?.name ?? "—",
                      target: "upload" as StepId,
                    },
                    {
                      key: "Material",
                      value: material ? `${material.name} · ${material.code}` : "—",
                      target: "material" as StepId,
                    },
                    {
                      key: "Quality",
                      value: quality
                        ? `${quality.label} · ${quality.layerHeight}`
                        : "—",
                      target: "quality" as StepId,
                    },
                    {
                      key: "Finish",
                      value: finish?.label ?? "—",
                      target: "finish" as StepId,
                    },
                    {
                      key: "Quantity",
                      value: String(configuration.quantity).padStart(2, "0"),
                      target: "finish" as StepId,
                    },
                  ].map((row) => (
                    <div key={row.key} className={styles.reviewRow}>
                      <div>
                        <dt className={styles.reviewKey}>{row.key}</dt>
                        <dd className={styles.reviewValue}>{row.value}</dd>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => goTo(row.target)}
                      >
                        <span className="u-visually-hidden">Edit {row.key}</span>
                        <span aria-hidden="true">Edit</span>
                      </Button>
                    </div>
                  ))}
                </dl>

                <QuoteSummary
                  response={quote}
                  loading={quoting}
                  stale={quoteIsStale}
                  onRetry={onRequestQuote}
                />

                <p className={styles.notice}>
                  <span className={styles.noticeGlyph}>
                    <Icon name="info" size={16} />
                  </span>
                  <span>
                    <Tag tone="info">Preview</Tag> Configuration options shown
                    here are provisional and are confirmed against machine
                    capability before production.
                  </span>
                </p>
              </>
            )}
          </div>

          <div className={styles.messageSlot}>
            {blocked && (
              <p className={styles.message} id={messageId} role="alert">
                <Icon name="error" size={14} />
                {blocked}
              </p>
            )}
          </div>

          <div className={styles.actions}>
            {index > 0 ? (
              <Button
                variant="secondary"
                iconLeft="arrow-left"
                onClick={() => goTo(stepAt(index - 1))}
              >
                Back
              </Button>
            ) : (
              <Button variant="secondary" href="/shop">
                Browse parts
              </Button>
            )}

            <span className={styles.actionsSpacer} />

            {step === "review" ? (
              <>
                <Button variant="ghost" onClick={onStartOver}>
                  Start over
                </Button>
                <Button loading={quoting} onClick={onRequestQuote}>
                  {quote === null
                    ? "Get manufacturing quote"
                    : quoteIsStale
                      ? "Recalculate estimate"
                      : "Recalculate"}
                </Button>
              </>
            ) : (
              <Button iconRight="arrow-right" onClick={onContinue}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
