import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
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

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  success?: boolean;
  fullWidth?: boolean;
  className?: string;
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type AsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    /** Renders a Next.js Link with button styling. Navigation, not submission. */
    href: string;
  };

export type ButtonProps = AsButton | AsLink;

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/**
 * SADA 3D action. Sharp corners, uppercase technical label, never a pill.
 *
 * Hover, press, focus and disabled are handled entirely in CSS, so this renders
 * as a Server Component. The design system's prototype tracked hover in React
 * state, which would force every consumer into the client bundle.
 *
 * Pass `href` for navigation and it renders an anchor — a CTA that navigates
 * should be a link, not a button carrying an onClick.
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
  className,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZE[size];

  const classes = clsx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    success && styles.success,
    className,
  );

  const content = (
    <>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && success && <Icon name="check" size={iconSize} />}
      {!loading && !success && iconLeft && <Icon name={iconLeft} size={iconSize} />}
      <span>{children}</span>
      {!loading && iconRight && <Icon name={iconRight} size={iconSize} />}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...anchorProps } = rest;

    return (
      <Link href={href} className={classes} {...anchorProps}>
        {content}
      </Link>
    );
  }

  const { disabled, type = "button", ...buttonProps } = rest;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
