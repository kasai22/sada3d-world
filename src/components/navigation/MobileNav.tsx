"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { Button, IconButton } from "@/components/core";
import type { NavItem } from "@/lib/navigation";
import { ROUTES } from "@/lib/routes";
import styles from "./MobileNav.module.css";

export interface MobileNavProps {
  items: readonly NavItem[];
  className?: string;
}

/**
 * Full-screen navigation drawer.
 *
 * Built on native <dialog>: focus trapping, Escape to close, inert background
 * and the backdrop all come from the platform rather than from hand-rolled
 * key and focus handling.
 */
export function MobileNav({ items, className }: MobileNavProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <IconButton
        icon="menu"
        label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={className}
      />

      <dialog
        ref={dialogRef}
        className={styles.drawer}
        aria-label="Main navigation"
        onClose={close}
      >
        <div className={styles.inner}>
          <div className={styles.top}>
            <span className={styles.wordmark}>
              <span className={styles.wordmarkName}>Reality</span>
              <span className={styles.wordmarkAccent}>3D</span>
            </span>
            <IconButton
              icon="x"
              label="Close menu"
              onClick={close}
            />
          </div>

          <nav aria-label="Main">
            <ul className={styles.links}>
              {items.map((item, index) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(styles.link, active && styles.active)}
                      aria-current={active ? "page" : undefined}
                      onClick={close}
                    >
                      {item.label}
                      <span className={styles.index} aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className={styles.footer}>
            <Button
              href={ROUTES.customPrint}
              size="lg"
              fullWidth
              iconRight="arrow-right"
              onClick={close}
            >
              Start printing
            </Button>
            <p className={styles.tagline}>Imagine. Design. Create.</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
