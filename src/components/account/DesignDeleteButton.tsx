"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/core";

import styles from "./DesignCard.module.css";

export interface DesignDeleteButtonProps {
  designId: string;
  name: string;
}

/**
 * Deletes a design, after asking.
 *
 * The request carries the design id and nothing else; the server resolves the
 * customer from the session and looks the id up only within their own designs.
 * Orders already placed keep their own snapshot of the file, which the
 * confirmation says, because "will this break my order?" is the question a
 * customer has at this moment.
 */
export function DesignDeleteButton({ designId, name }: DesignDeleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/designs/${encodeURIComponent(designId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "This design could not be deleted. Try again.");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("This design could not be deleted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" iconLeft="trash" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div className={styles.confirm} role="group" aria-label={`Delete ${name}`}>
      <p className={styles.confirmText}>
        Delete this design? Orders already placed keep their copy of the file.
      </p>
      <div className={styles.confirmActions}>
        <Button variant="destructive" size="sm" loading={busy} onClick={remove}>
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
