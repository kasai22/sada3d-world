import Link from "next/link";

import { footerColumns } from "@/lib/navigation";
import { SITE } from "@/lib/site";
import styles from "./Footer.module.css";

export interface FooterProps {
  /** Browse categories of the served catalog, with labels, from getBrowseCategoryLinks(). */
  browseCategories: readonly { value: string; label: string }[];
}

export function Footer({ browseCategories }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className="u-container">
        <div className={styles.top}>
          <div className={styles.brand}>
            <span className={styles.wordmark}>
              <span className={styles.wordmarkName}>Reality</span>
              <span className={styles.wordmarkAccent}>3D</span>
            </span>
            <p className={styles.tagline}>{SITE.tagline}</p>
            <p className={styles.blurb}>{SITE.description}</p>
          </div>

          {footerColumns(browseCategories).map((column) => (
            <nav key={column.title} className={styles.column} aria-label={column.title}>
              <h2 className={styles.columnTitle}>{column.title}</h2>
              <ul className={styles.list}>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.link}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={styles.bottom}>
          <p className={styles.legal}>
            © {year} {SITE.legalName}
          </p>
          {/*
            A live "Fleet online" indicator used to sit here, lit green on every
            page load. Nothing reports machine state to this application, so the
            dot was always on and meant nothing — an availability claim dressed
            as telemetry, in the one place a customer would read it as fact.
            The tagline says something true instead, and the indicator comes
            back when a fleet actually reports to it.
          */}
          <p className={styles.status}>{SITE.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
