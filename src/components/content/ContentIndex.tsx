import styles from "./ContentIndex.module.css";

export interface ContentIndexEntry {
  /** The id of the section this jumps to, without the "#". */
  value: string;
  label: string;
  /** Short technical note, e.g. a part count. Omitted when there is none. */
  meta?: string;
}

export interface ContentIndexProps {
  /** Names the list for assistive technology, e.g. "Materials". */
  label: string;
  entries: readonly ContentIndexEntry[];
}

/**
 * The jump list at the top of a long content page.
 *
 * Plain in-page anchors, and plain `<a>` rather than `next/link`: the target is
 * an element on the page already, so there is no navigation to intercept and no
 * route to prefetch. Fragment links also mean these pages need no client
 * JavaScript at all, and that scroll position is the browser's business —
 * including honouring a reduced-motion preference, which a scripted scroll
 * would have had to reimplement and would probably have got wrong.
 *
 * `aria-label` names the list because the links alone ("PLA", "PETG") do not
 * say what they are a list of.
 */
export function ContentIndex({ label, entries }: ContentIndexProps) {
  if (entries.length === 0) return null;

  return (
    <nav aria-label={`${label} index`} className={styles.nav}>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.value}>
            <a href={`#${entry.value}`} className={styles.link}>
              <span className={styles.label}>{entry.label}</span>
              {entry.meta && <span className={styles.meta}>{entry.meta}</span>}
              <span className={styles.rule} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
