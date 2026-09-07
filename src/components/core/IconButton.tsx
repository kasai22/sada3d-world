import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "./Icon";
import styles from "./IconButton.module.css";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: IconName;
  /** Required — an icon-only control has no accessible name without it. */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline";
  /** Renders as aria-pressed; use for toggles such as viewer tools. */
  active?: boolean;
}

const GLYPH: Record<"sm" | "md" | "lg", number> = { sm: 15, md: 17, lg: 20 };

/** Square icon-only control — viewer toolbar, header utilities, row actions. */
export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  active,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={clsx(
        styles.iconButton,
        styles[size],
        variant === "outline" && styles.outline,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={GLYPH[size]} />
    </button>
  );
}
