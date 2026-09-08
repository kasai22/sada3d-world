import Link from "next/link";
import type { HTMLAttributes } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "./Icon";
import styles from "./Tag.module.css";

export type TagTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  /** Technical mono by default; set false for prose-cased labels. */
  mono?: boolean;
  icon?: IconName;
  /** Supplying this turns the tag into a removable filter chip. */
  onRemove?: () => void;
  /**
   * Server-rendered alternative to `onRemove`: the remove affordance becomes a
   * link to the given URL. Used by URL-driven filter chips, which then need no
   * client JavaScript at all. Ignored when `onRemove` is supplied.
   */
  removeHref?: string;
  /** Names what is being removed, e.g. "PLA" -> "Remove filter PLA". */
  removeLabel?: string;
}

/**
 * Technical label chip. Becomes the active-filter chip when `onRemove` is set.
 *
 * Deliberately not marked "use client": a static tag renders on the server, and
 * a consumer passing `onRemove` is a client component by definition.
 */
export function Tag({
  children,
  tone = "neutral",
  mono = true,
  icon,
  onRemove,
  removeHref,
  removeLabel,
  className,
  ...rest
}: TagProps) {
  return (
    <span
      className={clsx(
        styles.tag,
        tone !== "neutral" && styles[tone],
        !mono && styles.interface,
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove filter"}
          className={styles.remove}
        >
          <Icon name="x" size={12} />
        </button>
      ) : (
        removeHref && (
          <Link
            href={removeHref}
            aria-label={removeLabel ?? "Remove filter"}
            className={styles.remove}
          >
            <Icon name="x" size={12} />
          </Link>
        )
      )}
    </span>
  );
}
