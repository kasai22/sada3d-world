import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "technical"
  | "destructive";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  success?: boolean;
  fullWidth?: boolean;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/**
 * SADA 3D action. Sharp corners, uppercase technical label, never a pill.
 *
 * Hover, press, focus and disabled are handled entirely in CSS, so this renders
 * as a Server Component. The design system's prototype tracked hover in React
 * state, which would force every consumer into the client bundle.
 */
export function Button({
  variant = "primary",
  size = "md",
  children,
  iconLeft,
  iconRight,
  loading = false,
  success = false,
  fullWidth = false,
  disabled,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;
  const iconSize = ICON_SIZE[size];

  return (
    <button
      type={type}
      disabled={inert}
      aria-busy={loading || undefined}
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        success && styles.success,
        className,
      )}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && success && <Icon name="check" size={iconSize} />}
      {!loading && !success && iconLeft && <Icon name={iconLeft} size={iconSize} />}
      <span>{children}</span>
      {!loading && iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}
