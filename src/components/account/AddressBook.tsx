"use client";

import { useState, useTransition } from "react";

import { Button, Icon, Tag } from "@/components/core";
import { INDIA_STATES, SUPPORTED_COUNTRIES } from "@/lib/checkout/types";
import type { CustomerAddressInput, CustomerAddressView } from "@/lib/account/types";
import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
} from "@/app/(site)/account/addresses/actions";

import { AccountState } from "./AccountState";
import { AddressForm } from "./AddressForm";
import styles from "./AddressBook.module.css";

export interface AddressBookProps {
  addresses: readonly CustomerAddressView[];
}

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string };

/**
 * The address book.
 *
 * One client component around a server-rendered list, because add, edit,
 * delete and set-default are interactions and the list is not. Every action
 * re-resolves the customer on the server; nothing in this component names one,
 * and an address id sent from here is only ever looked up *within* the calling
 * customer's own set.
 *
 * Every action reports what happened in a live region as well as by changing
 * the page, so a change is not something only a sighted user notices.
 */
export function AddressBook({ addresses }: AddressBookProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const editing =
    mode.kind === "edit"
      ? addresses.find((address) => address.id === mode.id)
      : undefined;

  async function save(input: CustomerAddressInput) {
    const result =
      mode.kind === "edit"
        ? await updateAddressAction(mode.id, input)
        : await createAddressAction(input);

    if (result.ok) {
      setAnnouncement(
        mode.kind === "edit" ? "Address saved." : "Address added.",
      );
      setMode({ kind: "list" });
    }

    return result;
  }

  function run(
    id: string,
    work: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
  ): void {
    if (pending) return;

    setProblem(null);
    setBusyId(id);

    startTransition(async () => {
      const result = await work();
      setBusyId(null);

      if (result.ok) {
        setAnnouncement(success);
        return;
      }

      setProblem(result.message ?? "That change could not be saved. Try again.");
    });
  }

  if (mode.kind !== "list") {
    return (
      <AddressForm
        address={editing}
        onSubmit={save}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  return (
    <div className={styles.book}>
      <p className="u-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      {addresses.length === 0 ? (
        <AccountState
          icon="map-pin"
          code="No addresses"
          title="No saved addresses"
          actions={
            <Button size="lg" onClick={() => setMode({ kind: "add" })}>
              Add an address
            </Button>
          }
        >
          <p>Add an address for faster checkout.</p>
        </AccountState>
      ) : (
        <>
          <ul className={styles.list}>
            {addresses.map((address) => {
              const busy = busyId === address.id;
              const state =
                INDIA_STATES.find((entry) => entry.code === address.address.state)
                  ?.label ?? address.address.state;
              const country =
                SUPPORTED_COUNTRIES.find(
                  (entry) => entry.code === address.address.country,
                )?.label ?? address.address.country;

              return (
                <li key={address.id} className={styles.item}>
                  <div className={styles.head}>
                    <div className={styles.identity}>
                      {address.label && (
                        <p className={styles.label}>{address.label}</p>
                      )}
                      <p className={styles.name}>{address.fullName}</p>
                    </div>
                    {address.isDefault && <Tag tone="accent">Default</Tag>}
                  </div>

                  <address className={styles.address}>
                    {address.address.line1}
                    <br />
                    {address.address.line2 && (
                      <>
                        {address.address.line2}
                        <br />
                      </>
                    )}
                    {address.address.city}, {state} {address.address.postalCode}
                    <br />
                    {country}
                    <br />
                    <span className={styles.phone}>{address.phone}</span>
                  </address>

                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setMode({ kind: "edit", id: address.id })}
                    >
                      Edit
                      <span className="u-visually-hidden">
                        {` ${address.fullName}`}
                      </span>
                    </Button>

                    {!address.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            address.id,
                            () => setDefaultAddressAction(address.id),
                            "Default address changed.",
                          )
                        }
                      >
                        Set as default
                        <span className="u-visually-hidden">
                          {` — ${address.fullName}`}
                        </span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft="trash"
                      disabled={busy}
                      loading={busy}
                      onClick={() =>
                        run(
                          address.id,
                          () => deleteAddressAction(address.id),
                          "Address removed.",
                        )
                      }
                    >
                      Remove
                      <span className="u-visually-hidden">
                        {` ${address.fullName}`}
                      </span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className={styles.add}>
            <Button
              size="lg"
              iconLeft="plus"
              onClick={() => setMode({ kind: "add" })}
            >
              Add an address
            </Button>
            <p className={styles.note}>
              <Icon name="info" size={14} />
              <span>
                Your default address is the one checkout will offer first.
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
