import { Footer, Header } from "@/components/navigation";
import styles from "./layout.module.css";

/**
 * Public site shell: header, main content region, footer.
 *
 * Everything customer-facing lives in this route group. The Payload admin and
 * the API sit outside it so they never inherit this chrome.
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>

      <Header />

      <main id="main" className={styles.main}>
        {children}
      </main>

      <Footer />
    </div>
  );
}
