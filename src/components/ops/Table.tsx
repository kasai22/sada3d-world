import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core/Icon";

import styles from "./Table.module.css";

/**
 * Data table primitives.
 *
 * Plain semantic tables, server-rendered: `<th scope="col">`, a caption for
 * assistive technology, `aria-sort` on the sorted column. The frame is a named,
 * focusable scroll region, so a table wider than a phone scrolls sideways
 * inside itself and a keyboard can scroll it — the page never does.
 *
 * A row opens by its primary link, which is stretched over the row. Other links
 * in the row sit above it (`Above`) and stay independently clickable.
 */

type Align = "left" | "right" | "center";
/** Hide a secondary column below this width: sm < 768, md < 1024, lg < 1280. */
type HideBelow = "sm" | "md" | "lg";

const HIDE: Record<HideBelow, string | undefined> = {
  sm: styles.hideSm,
  md: styles.hideMd,
  lg: styles.hideLg,
};

export function TableFrame({
  label,
  caption,
  flush = false,
  children,
}: {
  label: string;
  caption?: string;
  /** Inside a panel that already draws the border. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx(styles.frame, flush && styles.flush)} role="region" aria-label={label} tabIndex={0}>
      <table className={styles.table}>
        {caption && <caption className="u-visually-hidden">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export interface SortState {
  href: string;
  active: boolean;
  direction: "asc" | "desc";
}

export function Th({
  children,
  align,
  hide,
  width,
  sort,
}: {
  children: ReactNode;
  align?: Align;
  hide?: HideBelow;
  width?: string;
  sort?: SortState;
}) {
  const style: CSSProperties | undefined = width ? { width } : undefined;

  return (
    <th
      scope="col"
      className={clsx(styles.th, align && styles[align], hide && HIDE[hide])}
      style={style}
      aria-sort={sort?.active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      {sort ? (
        <Link href={sort.href} className={styles.sort} scroll={false}>
          {children}
          <Icon name={sort.active ? (sort.direction === "asc" ? "arrow-up" : "arrow-down") : "sort"} size={12} />
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  align,
  hide,
  mono = false,
  muted = false,
  nowrap = false,
  colSpan,
  className,
}: {
  children?: ReactNode;
  align?: Align;
  hide?: HideBelow;
  mono?: boolean;
  muted?: boolean;
  nowrap?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={clsx(
        styles.td,
        align && styles[align],
        hide && HIDE[hide],
        mono && styles.mono,
        muted && styles.muted,
        nowrap && styles.nowrap,
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={clsx(styles.row, className)}>{children}</tr>;
}

/** The row's primary link, stretched over the whole row. */
export function RowLink({ href, children, mono = false }: { href: string; children: ReactNode; mono?: boolean }) {
  return (
    <Link href={href} className={clsx(styles.rowLink, mono && styles.mono)}>
      {children}
    </Link>
  );
}

/** Content that must stay clickable above a stretched row link. */
export function Above({ children }: { children: ReactNode }) {
  return <span className={styles.above}>{children}</span>;
}

/** A primary line with a quieter technical line beneath it. */
export function Stack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <span className={styles.stack}>
      <span className={styles.primary}>{primary}</span>
      {secondary && <span className={styles.secondary}>{secondary}</span>}
    </span>
  );
}

/** An inline link inside a cell, styled as text. */
export function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.cellLink}>
      {children}
    </Link>
  );
}
