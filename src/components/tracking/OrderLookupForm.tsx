"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { Input } from "@/components/forms";
import { lookupOrderAction } from "@/app/(site)/orders/actions";
import styles from "./OrderLookupForm.module.css";

/**
 * Order lookup.
 *
 * The reference and the email together. The reference alone is not enough, and
 * deliberately so — references are sequential, so one is a guess anyone can
 * make. The email is what actually proves the order is yours.
 *
 * The form learns nothing on failure: a wrong email and a reference that does
 * not exist produce the same message, so this cannot be used to find out which
 * orders are real.
 */
export function OrderLookupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    setError(null);

    startTransition(async () => {
      const result = await lookupOrderAction(reference, email);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.push(`/orders/${encodeURIComponent(result.reference)}`);
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Input
        label="Order reference"
        size="lg"
        type="text"
        technical
        autoComplete="off"
        spellCheck={false}
        placeholder="S3D-000001"
        hint="On your order confirmation."
        value={reference}
        onChange={(event) => setReference(event.target.value)}
      />

      <Input
        label="Email"
        size="lg"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="The address the order was placed with."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Button type="submit" size="lg" loading={pending} disabled={pending}>
        {pending ? "Checking" : "Find order"}
      </Button>

      {/* One live region. The message is deliberately the same for every
          failure, so it cannot be used to probe which references exist. */}
      <div className={styles.message} aria-live="polite">
        {error && (
          <p className={styles.error} role="alert">
            <Icon name="error" size={14} />
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
