"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import styles from "./NavLink.module.css";

export interface NavLinkProps {
  href: string;
  label: string;
  className?: string;
}

/**
 * Primary navigation link.
 *
 * Client-only because active state depends on the pathname, which a layout
 * cannot read on the server. Kept deliberately small so the header itself
 * stays a Server Component.
 */
export function NavLink({ href, label, className }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={clsx(styles.link, active && styles.active, className)}
      aria-current={active ? "page" : undefined}
    >
      {label}
      <span className={styles.rule} aria-hidden="true" />
    </Link>
  );
}
