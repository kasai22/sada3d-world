import Link from "next/link";

import { StatusDot } from "@/components/core";
import { SITE } from "@/lib/site";
import styles from "./Footer.module.css";

interface FooterColumn {
  title: string;
  links: readonly { href: string; label: string }[];
}

const COLUMNS: readonly FooterColumn[] = [
  {
    title: "Manufacture",
    links: [
      { href: "/custom-print", label: "Custom print" },
      { href: "/materials", label: "Materials" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/solutions", label: "Solutions" },
    ],
  },
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All parts" },
      { href: "/shop/functional", label: "Functional" },
      { href: "/shop/automotive", label: "Automotive" },
      { href: "/shop/lifestyle", label: "Lifestyle" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/orders", label: "Orders" },
      { href: "/account/designs", label: "Saved designs" },
      { href: "/track", label: "Track an order" },
      { href: "/account/settings", label: "Settings" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className="u-container">
        <div className={styles.top}>
          <div className={styles.brand}>
            <span className={styles.wordmark}>
              <span className={styles.wordmarkSada}>SADA</span>
              <span className={styles.wordmarkAccent}>3D</span>
            </span>
            <p className={styles.tagline}>{SITE.tagline}</p>
            <p className={styles.blurb}>{SITE.description}</p>
          </div>

          {COLUMNS.map((column) => (
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
          {/* Placeholder until the machine fleet reports real state. */}
          <StatusDot status="printing" label="Fleet online" className={styles.status} />
        </div>
      </div>
    </footer>
  );
}
