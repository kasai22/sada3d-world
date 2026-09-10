import Link from "next/link";
import clsx from "clsx";

import { ORDER_FILTERS, type CustomerOrderFilter } from "@/lib/account/order-filters";
import styles from "./OrderFilterBar.module.css";

export interface OrderFilterBarProps {
  active: CustomerOrderFilter;
  /** Count per bucket, so a filter never leads somewhere empty by surprise. */
  counts: Readonly<Record<CustomerOrderFilter, number>>;
}

/**
 * Order list filters.
 *
 * Links, not buttons, and the URL is the state: `/account/orders?status=active`
 * is shareable, bookmarkable, survives a refresh and works with the back
 * button. Client state would give none of that and would need JavaScript to
 * give anything at all.
 *
 * Not a `<nav>`: these are controls that filter what is on the page, not
 * navigation to elsewhere. `aria-current` still marks which one is applied.
 */
export function OrderFilterBar({ active, counts }: OrderFilterBarProps) {
  return (
    <div className={styles.bar} role="group" aria-label="Filter orders">
      {ORDER_FILTERS.map((filter) => {
        const current = filter.value === active;

        return (
          <Link
            key={filter.value}
            href={
              filter.value === "all"
                ? "/account/orders"
                : `/account/orders?status=${filter.value}`
            }
            className={clsx("u-plain", styles.filter, current && styles.active)}
            aria-current={current ? "true" : undefined}
          >
            {filter.label}
            <span className={styles.count}>{counts[filter.value]}</span>
          </Link>
        );
      })}
    </div>
  );
}
