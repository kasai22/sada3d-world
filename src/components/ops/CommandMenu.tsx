"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core/Icon";
import type { SearchResult } from "@/lib/ops/search";

import { NAV_GROUPS } from "./navigation";
import type { OpsSearchAction } from "./ShellFrame";
import styles from "./CommandMenu.module.css";

interface Option {
  id: string;
  group: string;
  label: string;
  detail: string;
  href: string;
  external: boolean;
}

const GROUP_ICON: Record<string, IconName> = {
  Orders: "clipboard",
  Customers: "users",
  Products: "box",
  Inventory: "boxes",
  Designs: "file-box",
  Production: "factory",
  Payments: "wallet",
  "Go to": "arrow-right",
};

const COMMANDS: readonly Option[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    id: `go:${item.href}`,
    group: "Go to",
    label: item.label,
    detail: item.external ? "Payload collections" : (group.label ?? "Reality 3D Admin"),
    href: item.href,
    external: item.external === true,
  })),
);

const MIN_QUERY = 2;
const DEBOUNCE_MS = 180;

/**
 * Search and navigation, from the keyboard.
 *
 * A native modal `<dialog>`: the browser traps focus inside it, makes the page
 * behind it inert, closes it on Escape and returns focus to what opened it. The
 * input is an ARIA combobox driving a listbox, so arrow keys move through
 * results while focus stays in the field.
 *
 * Results come from a server action that re-checks the operator on every call.
 * Only the latest request's answer is shown, so a slow early response cannot
 * replace a later one.
 */
export function CommandMenu({ onClose, search }: { onClose: () => void; search: OpsSearchAction }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const listId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    input.current?.focus();
    return () => {
      if (node?.open) node.close();
    };
  }, []);

  const text = query.trim();

  useEffect(() => {
    if (text.length < MIN_QUERY) return;

    const request = ++latest.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await search(text);
        if (request !== latest.current) return;
        setResults(response.results);
        setError(response.error ?? null);
        setStatus(response.error ? "error" : "idle");
      } catch {
        if (request !== latest.current) return;
        setResults([]);
        setError("Search is unavailable right now.");
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [text, search]);

  const lower = text.toLowerCase();
  const options: Option[] = [
    ...(text.length >= MIN_QUERY
      ? results.map((result) => ({ ...result, external: false }))
      : []),
    ...COMMANDS.filter((command) => !lower || command.label.toLowerCase().includes(lower)),
  ];

  const groups: { label: string; options: { option: Option; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const group = groups.find((candidate) => candidate.label === option.group);
    if (group) group.options.push({ option, index });
    else groups.push({ label: option.group, options: [{ option, index }] });
  });

  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function choose(option: Option | undefined) {
    if (!option) return;
    onClose();
    if (option.external) window.location.assign(option.href);
    else router.push(option.href);
  }

  function onChange(value: string) {
    setQuery(value);
    setActive(0);
    if (value.trim().length >= MIN_QUERY) {
      setStatus("loading");
    } else {
      latest.current += 1;
      setResults([]);
      setError(null);
      setStatus("idle");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  }

  const searching = text.length >= MIN_QUERY;
  const message =
    status === "loading" && searching
      ? "Searching…"
      : status === "error"
        ? error
        : searching && results.length === 0
          ? `No orders, customers, designs, jobs or payments match “${text}”.`
          : "";

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Search the console"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.inputRow}>
          <Icon name="search" size={18} />
          <input
            ref={input}
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={options.length > 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="Search orders, customers, designs, jobs and payments"
            placeholder="Search orders, customers, products, SKUs, inventory…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className={styles.list}>
          {groups.map((group) => (
            <div key={group.label} role="group" aria-labelledby={`${listId}-${group.label}`}>
              <div className={styles.groupLabel} id={`${listId}-${group.label}`} role="presentation">
                {group.label}
              </div>
              {group.options.map(({ option, index }) => (
                <div
                  key={option.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={clsx(styles.option)}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className={styles.optionIcon}>
                    <Icon name={GROUP_ICON[option.group] ?? "arrow-right"} size={16} />
                  </span>
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    <span className={styles.optionDetail}>{option.detail}</span>
                  </span>
                  {option.external && <Icon name="external-link" size={13} className={styles.external} />}
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className={styles.status} role="status" aria-live="polite">
          {message}
        </p>

        <div className={styles.footer} aria-hidden="true">
          <span>↑ ↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </dialog>
  );
}
