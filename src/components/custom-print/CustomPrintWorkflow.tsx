"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MaterialCard } from "@/components/commerce";
import { Button, Icon, Tag } from "@/components/core";
import { FileUpload, QuantityStepper } from "@/components/forms";
import { ProgressBar } from "@/components/manufacturing";
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
import { submitCustomCartIntent } from "@/lib/cart/intent";
import type { QuoteResponse } from "@/lib/pricing/types";
import { forgetModelFile, rememberModelFile } from "@/lib/custom-print/modelBlobs";
import {
  NOT_ANALYZED,
  analysisFromDetail,
  analyzeUpload,
  isAnalyzableExtension,
  type ModelAnalysisState,
} from "@/lib/custom-print/analysis";

import { ModelAnalysis } from "./ModelAnalysis";
import {
  fetchStoredDesign,
  finishUpload,
  modelStorage,
  storeModelFile,
  type StoreResult,
} from "@/lib/custom-print/storage";
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
 * Where the selected file is on its way to durable storage.
 *
 * Every state is something that is actually happening. There is no timer and
 * no estimated percentage: `uploading` reports bytes the browser has sent, and
 * `verifying` is indeterminate because the server does not report how far
 * through a parse it is.
 *
 *   idle         nothing selected, or nothing to store
 *   hashing      validating: computing the checksum the server will check
 *   authorising  preparing the upload: asking the server for a target
 *   uploading    bytes moving to storage
 *   verifying    the server re-reading, checking and measuring what arrived
 *   stored       verified; the part can be ordered
 *   local        cannot be stored here (signed out, or no storage); quote only
 *   failed       did not store; `designId` when verification can be retried
 */
type UploadState =
  | { status: "idle" }
  | { status: "hashing" }
  | { status: "authorising" }
  | { status: "uploading"; loaded: number; total: number }
  | { status: "verifying"; analyzable: boolean }
  | { status: "stored" }
  | { status: "local"; message: string }
  | { status: "failed"; message: string; designId?: string };

const IDLE: UploadState = { status: "idle" };

function isBusy(state: UploadState): boolean {
  return (
    state.status === "hashing" ||
    state.status === "authorising" ||
    state.status === "uploading" ||
    state.status === "verifying"
  );
}

/**
 * The custom manufacturing workflow.
 *
 * Owns model identity and configuration for the whole flow — steps read and
 * write one state object rather than holding pieces of their own. Rendering
 * (Phase 9), pricing (Phase 8) and durable storage (Stage 16) each sit behind a
 * seam in lib/custom-print and are not reached into from here.
 */
export function CustomPrintWorkflow() {
  const router = useRouter();
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
  const [analysis, setAnalysis] = useState<ModelAnalysisState>(NOT_ANALYZED);
  const [upload, setUpload] = useState<UploadState>(IDLE);
  /*
   * Abort the analysis and the upload of a file the customer has already
   * replaced. Without this, a slow measurement or verification of the first
   * model can land after the second is on screen and describe the wrong part.
   */
  const analysisRun = useRef<AbortController | null>(null);
  const uploadRun = useRef<AbortController | null>(null);
  /* The selected File, kept for a retry. Gone after a reload, as it should be. */
  const selectedFile = useRef<File | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  /*
   * The configuration a quote was produced from. Comparing it against the
   * current one is what stops a figure describing a configuration the customer
   * has since changed.
   */
  const [quotedSignature, setQuotedSignature] = useState<string | null>(null);

  /* Adding the quoted configuration to the cart. */
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

    /*
     * A stored model outlives the tab's File object. Ask the server for the
     * design and its authoritative analysis; if the design is gone, say so
     * rather than showing a part that can no longer be ordered.
     */
    const model = stored.model;
    if (!model?.stored) return;

    const run = new AbortController();
    uploadRun.current = run;

    void fetchStoredDesign(model.id, run.signal).then((detail) => {
      if (uploadRun.current !== run) return;
      uploadRun.current = null;

      if (detail?.design.state === "verified") {
        setUpload({ status: "stored" });
        setAnalysis(analysisFromDetail(detail));
      } else {
        setUpload({
          status: "failed",
          message: "The stored copy of this model is no longer available. Upload it again.",
        });
      }
    });

    return () => run.abort();
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

  /** Stops whatever is still running for the previous file. */
  function cancelRuns() {
    analysisRun.current?.abort();
    analysisRun.current = null;
    uploadRun.current?.abort();
    uploadRun.current = null;
  }

  /** Measures a file that is staying in the browser. Not authoritative. */
  function analyseLocally(file: File) {
    const run = new AbortController();
    analysisRun.current = run;
    setAnalysis({ status: "analyzing" });

    void analyzeUpload(file, { signal: run.signal }).then((result) => {
      // A newer file has already replaced this one; its result is stale.
      if (analysisRun.current !== run) return;
      setAnalysis(result);
    });
  }

  function applyStoreResult(result: StoreResult, file: File | null, model: UploadedModel) {
    switch (result.status) {
      case "stored": {
        const { design } = result.detail;
        const storedModel: UploadedModel = {
          ...model,
          id: design.id,
          name: design.name,
          stored: true,
        };

        // The viewer keeps drawing from memory while this tab has the file.
        if (file) rememberModelFile(design.id, file);

        setConfiguration((current) => ({ ...current, model: storedModel }));
        setUpload({ status: "stored" });
        setAnalysis(analysisFromDetail(result.detail));
        return;
      }

      case "not_stored":
        setUpload({ status: "local", message: result.message });
        if (file) analyseLocally(file);
        return;

      case "failed":
        setUpload({
          status: "failed",
          message: result.message,
          ...(result.designId ? { designId: result.designId } : {}),
        });
        return;

      case "aborted":
        return;
    }
  }

  /**
   * Runs the store pipeline for a prepared model, reporting each real phase.
   *
   * With a `designId` it only re-runs verification, which needs no file — so
   * it works after a reload, when the tab no longer has one.
   */
  async function store(file: File | null, model: UploadedModel, designId?: string) {
    if (!designId && !file) return;

    const run = new AbortController();
    uploadRun.current = run;
    setAnalysis(NOT_ANALYZED);

    const analyzable = isAnalyzableExtension(model.extension);
    const options = {
      signal: run.signal,
      onPhase: (phase: "hashing" | "authorising" | "uploading" | "verifying") => {
        if (uploadRun.current !== run) return;
        if (phase === "uploading") {
          setUpload({ status: "uploading", loaded: 0, total: file?.size ?? model.sizeBytes });
        } else if (phase === "verifying") {
          setUpload({ status: "verifying", analyzable });
        } else {
          setUpload({ status: phase });
        }
      },
      onProgress: ({ loaded, total }: { loaded: number; total: number }) => {
        if (uploadRun.current !== run) return;
        setUpload({ status: "uploading", loaded, total });
      },
    };

    const result = designId
      ? await finishUpload(designId, options)
      : file
        ? await storeModelFile(file, options)
        : ({ status: "aborted" } as const);

    if (uploadRun.current !== run) return;
    uploadRun.current = null;
    applyStoreResult(result, file, model);
  }

  async function onFileChange(file: File | null) {
    setFileError(null);
    setBlocked(null);

    cancelRuns();
    setAnalysis(NOT_ANALYZED);
    setUpload(IDLE);
    selectedFile.current = file;

    if (!file) {
      forgetModelFile();
      setConfiguration((current) => ({ ...current, model: undefined }));
      return;
    }

    setPreparing(true);
    let model: UploadedModel;
    try {
      model = await modelStorage.prepare(file);
    } catch (cause) {
      setFileError(
        cause instanceof ModelFileError
          ? cause.message
          : "The file couldn't be prepared. Try again.",
      );
      return;
    } finally {
      setPreparing(false);
    }

    // The part is on screen from memory at once; storing runs alongside.
    rememberModelFile(model.id, file);
    setConfiguration((current) => ({ ...current, model }));
    setReplacing(false);

    /*
     * Deliberately not awaited: the workflow stays usable while the file
     * uploads and is verified, and the stage says what is happening.
     */
    void store(file, model);
  }

  function onRetryUpload() {
    const model = configuration.model;
    if (!model || upload.status !== "failed") return;

    if (upload.designId) {
      // Verification only: the file, if this tab still has it, keeps the viewer local.
      void store(selectedFile.current, model, upload.designId);
      return;
    }

    if (selectedFile.current) void store(selectedFile.current, model);
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

  /**
   * Puts the quoted configuration in the cart.
   *
   * Only the identity of the model, the configuration and the quantity cross
   * the boundary. The server re-runs the quote engine over them, so the price
   * the cart holds is the server's figure and not the one on this screen. For a
   * stored model the server also takes the file's name, size and format from
   * the verified design rather than from this request.
   */
  async function onAddToCart() {
    const model = configuration.model;
    if (!model || !configuration.material || !configuration.quality || !configuration.finish) {
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const result = await submitCustomCartIntent({
        model: {
          modelId: model.id,
          name: model.name,
          extension: model.extension,
          sizeBytes: model.sizeBytes,
          formatLabel: model.inspection.formatLabel,
          triangles: model.inspection.triangles,
        },
        material: configuration.material,
        quality: configuration.quality,
        finish: configuration.finish,
        quantity: configuration.quantity,
      });

      if (!result.ok) {
        setAddError(result.message);
        return;
      }

      setAdded(true);
      router.refresh();
    } catch {
      setAddError("This part could not be added. Try again.");
    } finally {
      setAdding(false);
    }
  }

  function onStartOver() {
    cancelRuns();
    setAnalysis(NOT_ANALYZED);
    setUpload(IDLE);
    selectedFile.current = null;
    forgetModelFile();
    setReplacing(false);
    clearConfiguration();
    setConfiguration(EMPTY_CONFIGURATION);
    setQuote(null);
    setQuotedSignature(null);
    setAdded(false);
    setAddError(null);
    goTo("upload");
  }

  const quoteIsStale =
    quote !== null && quotedSignature !== pricingSignature(configuration);

  /*
   * A part can be added once it has been quoted and the configuration has not
   * moved since. A stale quote is not an add-to-cart: the price on screen no
   * longer describes what is configured. Nor is a part whose file is still on
   * its way to storage — it is added once there is a verified design to add.
   */
  const quotedTotal =
    quote?.status === "available" && !quoteIsStale ? quote.quote.total : null;
  const uploadBusy = isBusy(upload);
  const canAddToCart = quotedTotal !== null && !uploadBusy && upload.status !== "failed";

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
                cancelRuns();
                setAnalysis(NOT_ANALYZED);
                setUpload(IDLE);
                selectedFile.current = null;
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

          {configuration.model && !replacing && (
            <UploadStatus state={upload} onRetry={onRetryUpload} />
          )}

          {/*
            File facts and manufacturing checks, beneath the model they describe
            and above the configuration that follows. Price appears later, in
            the review panel, so the three categories never share a surface.
          */}
          <ModelAnalysis state={analysis} />
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
                  <span>Supported: 3MF · STL · STEP · OBJ</span>
                  <span>Max {formatBytes(MAX_MODEL_BYTES)}</span>
                </div>

                <p className={styles.notice}>
                  <span className={styles.noticeGlyph}>
                    <Icon name="info" size={16} />
                  </span>
                  Files are uploaded to private storage and checked on our
                  servers before they can be manufactured. Only your account can
                  open them.
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

                {quotedTotal !== null && uploadBusy && (
                  <p className={styles.notice} aria-live="polite">
                    <span className={styles.noticeGlyph}>
                      <Icon name="loader" size={16} />
                    </span>
                    Your file is still being stored and checked. The part can be
                    added to your cart once that finishes.
                  </p>
                )}

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
            {addError && (
              <p className={styles.message} role="alert">
                <Icon name="error" size={14} />
                {addError}
              </p>
            )}
            {added && !addError && (
              <p className={styles.message} role="status">
                <Icon name="check" size={14} />
                {upload.status === "stored"
                  ? "Added to your cart."
                  : "Added to your cart. It can be ordered once its file is stored for manufacturing."}
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
                <Button
                  variant={canAddToCart ? "secondary" : "primary"}
                  loading={quoting}
                  onClick={onRequestQuote}
                >
                  {quote === null
                    ? "Get manufacturing quote"
                    : quoteIsStale
                      ? "Recalculate estimate"
                      : "Recalculate"}
                </Button>
                {canAddToCart && (
                  <Button
                    iconLeft={added ? undefined : "shopping-cart"}
                    loading={adding}
                    success={added}
                    onClick={onAddToCart}
                  >
                    {added ? "Added to cart" : "Add to cart"}
                  </Button>
                )}
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

/**
 * The file's journey to storage, stated as it happens.
 *
 * Only the upload has a percentage, because only the upload has a measurable
 * one: the browser counts the bytes it has sent. Verification is a spinner and
 * a sentence, because the server does not report how far through reading a
 * model it is and a number would be invented.
 */
function UploadStatus({ state, onRetry }: { state: UploadState; onRetry: () => void }) {
  switch (state.status) {
    case "idle":
      return null;

    case "hashing":
    case "authorising":
    case "verifying":
      return (
        <p className={`${styles.notice} ${styles.uploadStatus}`} aria-live="polite">
          <span className={styles.noticeGlyph}>
            <Icon name="loader" size={16} />
          </span>
          {state.status === "hashing"
            ? "Validating the file."
            : state.status === "authorising"
              ? "Preparing the upload."
              : state.analyzable
                ? "Verifying and analysing the stored file."
                : "Verifying the stored file."}
        </p>
      );

    case "uploading": {
      const percent =
        state.total > 0 ? Math.min(100, Math.floor((state.loaded / state.total) * 100)) : 0;
      return (
        <div className={styles.uploadStatus} aria-live="polite">
          <ProgressBar
            value={percent}
            label={`Uploading · ${formatBytes(state.loaded)} of ${formatBytes(state.total)}`}
          />
        </div>
      );
    }

    case "stored":
      return (
        <p className={`${styles.notice} ${styles.uploadStatus}`} role="status">
          <span className={`${styles.noticeGlyph} ${styles.success}`}>
            <Icon name="check-circle" size={16} />
          </span>
          Stored for manufacturing and verified.
        </p>
      );

    case "local":
      return (
        <p className={`${styles.notice} ${styles.uploadStatus}`} role="status">
          <span className={styles.noticeGlyph}>
            <Icon name="info" size={16} />
          </span>
          {state.message}
        </p>
      );

    case "failed":
      return (
        <div className={styles.uploadStatus}>
          <p className={styles.message} role="alert">
            <Icon name="error" size={14} />
            {state.message}
          </p>
          <Button variant="secondary" size="sm" iconLeft="reset" onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
  }
}
