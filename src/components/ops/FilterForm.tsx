"use client";

import Form from "next/form";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/core/Button";

import styles from "./FilterForm.module.css";

/**
 * A list's filters, as a GET form.
 *
 * `next/form` turns a submission into a client-side navigation to the same page
 * with the fields as search parameters, so every filtered view is a URL and the
 * form still works before JavaScript loads. Choosing from a select or a date
 * applies at once; free text applies on Enter or with the Apply button.
 */
export function FilterForm({
  action,
  label,
  clearHref,
  active,
  children,
}: {
  action: string;
  /** What the form searches, for its landmark name. */
  label: string;
  clearHref: string;
  /** Whether any filter is applied, to show Clear. */
  active: boolean;
  children: ReactNode;
}) {
  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    const immediate =
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement && (target.type === "date" || target.type === "checkbox"));
    if (immediate) event.currentTarget.requestSubmit();
  }

  return (
    <Form action={action} className={styles.form} role="search" aria-label={label} onChange={onChange}>
      <div className={styles.fields}>{children}</div>
      <div className={styles.buttons}>
        <Button type="submit" size="sm" variant="secondary">
          Apply
        </Button>
        {active && (
          <Button href={clearHref} size="sm" variant="ghost">
            Clear
          </Button>
        )}
      </div>
    </Form>
  );
}

/** A labelled native checkbox that submits the form when toggled. */
export function FilterCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}
