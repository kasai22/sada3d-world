"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/core";
import { Checkbox, Input, Select } from "@/components/forms";
import {
  EMPTY_ADDRESS,
  INDIA_STATES,
  SUPPORTED_COUNTRIES,
  type FieldError,
  type ShippingAddress,
} from "@/lib/checkout/types";
import type { CustomerAddressInput, CustomerAddressView } from "@/lib/account/types";

import styles from "./AddressForm.module.css";

export type AddressSubmit = (
  input: CustomerAddressInput,
) => Promise<
  { ok: true } | { ok: false; message?: string; errors?: readonly FieldError[] }
>;

export interface AddressFormProps {
  /** Present when editing. Absent when adding. */
  address?: CustomerAddressView;
  onSubmit: AddressSubmit;
  onCancel: () => void;
}

type Errors = Record<string, string>;

function toMap(errors: readonly FieldError[]): Errors {
  return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

/**
 * Add or edit a delivery address.
 *
 * Built the way the checkout form is built, and for the same reasons: large
 * fields, a visible label on every one, server-side validation with the
 * messages placed against the fields they belong to, and focus moved to the
 * first thing that was rejected.
 *
 * The browser is not the authority on whether an address is valid. This
 * submits, the server validates with the same rules checkout uses, and what
 * comes back is what is shown. There is no client-side copy of the rules to
 * disagree with the server's.
 */
export function AddressForm({ address, onSubmit, onCancel }: AddressFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState(address?.label ?? "");
  const [fullName, setFullName] = useState(address?.fullName ?? "");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [value, setValue] = useState<ShippingAddress>(
    address?.address ?? EMPTY_ADDRESS,
  );
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);

  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);

  const set = (patch: Partial<ShippingAddress>) =>
    setValue((current) => ({ ...current, ...patch }));

  /** Moves focus to the first field the server rejected. */
  function focusFirstError(map: Errors): void {
    const first = Object.keys(map)[0];
    if (!first) return;

    formRef.current
      ?.querySelector<HTMLElement>(
        `[data-field="${CSS.escape(first)}"] input, [data-field="${CSS.escape(first)}"] select`,
      )
      ?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    setErrors({});
    setProblem(null);

    startTransition(async () => {
      const result = await onSubmit({
        label: label.trim() || undefined,
        fullName,
        phone,
        address: value,
        isDefault,
      });

      if (result.ok) return;

      if (result.errors && result.errors.length > 0) {
        const map = toMap(result.errors);
        setErrors(map);
        focusFirstError(map);
        return;
      }

      setProblem(result.message ?? "This address could not be saved. Try again.");
    });
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
      <h3 className={styles.title}>
        {address ? "Edit address" : "Add an address"}
      </h3>

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.full} data-field="label">
          <Input
            label="Label"
            hint="Optional, e.g. Workshop"
            size="lg"
            value={label}
            maxLength={40}
            error={errors.label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div data-field="fullName">
          <Input
            label="Full name"
            size="lg"
            required
            autoComplete="name"
            value={fullName}
            error={errors.fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>

        <div data-field="phone">
          <Input
            label="Phone"
            size="lg"
            required
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            error={errors.phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className={styles.full} data-field="address.line1">
          <Input
            label="Address"
            size="lg"
            required
            autoComplete="address-line1"
            value={value.line1}
            error={errors["address.line1"]}
            onChange={(event) => set({ line1: event.target.value })}
          />
        </div>

        <div className={styles.full} data-field="address.line2">
          <Input
            label="Apartment, floor, landmark"
            hint="Optional"
            size="lg"
            autoComplete="address-line2"
            value={value.line2 ?? ""}
            error={errors["address.line2"]}
            onChange={(event) => set({ line2: event.target.value })}
          />
        </div>

        <div data-field="address.city">
          <Input
            label="City"
            size="lg"
            required
            autoComplete="address-level2"
            value={value.city}
            error={errors["address.city"]}
            onChange={(event) => set({ city: event.target.value })}
          />
        </div>

        <div data-field="address.state">
          <Select
            label="State"
            size="lg"
            required
            placeholder="Select a state"
            options={INDIA_STATES.map((state) => ({
              value: state.code,
              label: state.label,
            }))}
            value={value.state}
            error={errors["address.state"]}
            onChange={(event) => set({ state: event.target.value })}
          />
        </div>

        <div data-field="address.postalCode">
          <Input
            label="PIN code"
            size="lg"
            required
            technical
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={value.postalCode}
            error={errors["address.postalCode"]}
            onChange={(event) => set({ postalCode: event.target.value })}
          />
        </div>

        <div data-field="address.country">
          <Select
            label="Country"
            size="lg"
            required
            options={SUPPORTED_COUNTRIES.map((country) => ({
              value: country.code,
              label: country.label,
            }))}
            value={value.country}
            error={errors["address.country"]}
            onChange={(event) => set({ country: event.target.value })}
          />
        </div>
      </div>

      <Checkbox
        label="Use as my default address"
        checked={isDefault}
        // An address that is already the default cannot stop being one by
        // being edited: something else has to become it instead.
        disabled={address?.isDefault === true}
        onChange={(event) => setIsDefault(event.target.checked)}
      />

      <div className={styles.actions}>
        <Button type="submit" size="lg" loading={pending}>
          {pending ? "Saving" : "Save address"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
