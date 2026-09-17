"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";

import { ConsumptionEditor, type ConsumptionInput, type ConsumptionRow } from "./ConsumptionEditor";
import styles from "./ProductForm.module.css";

export interface ConsumptionFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Record<number, string>;
  at?: number;
}

/**
 * The workspace's Production & Consumption tab: the editor, one save, and the
 * server's answer. Submitted by hand so the lines stay as typed when refused.
 */
export function ConsumptionForm({
  action,
  inputs,
  initial,
}: {
  action: (previous: ConsumptionFormState, form: FormData) => Promise<ConsumptionFormState>;
  inputs: readonly ConsumptionInput[];
  initial: readonly ConsumptionRow[];
}) {
  const [state, submit, pending] = useActionState(action, { status: "idle" } as ConsumptionFormState);
  const [dirty, setDirty] = useState(false);
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);

  if (state.at !== seenAt) {
    setSeenAt(state.at);
    if (state.status === "saved") setDirty(false);
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => submit(data));
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {state.status === "error" && state.message && (
        <p className={styles.alert} role="alert">
          <Icon name="error" size={16} />
          <span>{state.message}</span>
        </p>
      )}
      <section className={styles.panel} aria-label="Production and consumption">
        <ConsumptionEditor
          inputs={inputs}
          initial={initial}
          errors={state.status === "error" ? (state.errors ?? {}) : {}}
          onChange={() => setDirty(true)}
        />
      </section>
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
          ) : (
            "Saving changes the expected consumption only. Stock, price and approval are not changed."
          )}
        </p>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={pending} iconLeft="check">
            {pending ? "Saving…" : "Save consumption"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
