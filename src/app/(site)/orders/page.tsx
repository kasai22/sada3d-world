import type { Metadata } from "next";
import Link from "next/link";

import { OrderLookupForm } from "@/components/tracking";
import { Breadcrumbs } from "@/components/structure";
import { grantedReferences } from "@/lib/orders/grants";
import {
  FIXTURE_EMAIL,
  FIXTURE_REFERENCES,
  demoOrdersEnabled,
  seedTrackingFixtures,
} from "@/lib/orders/fixtures";
import { orderRepository } from "@/lib/orders/repository";
import { ORDER_STATUS_LABEL } from "@/lib/orders/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Follow an order and the parts being made for it.",
  alternates: { canonical: "/orders" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Order lookup, plus whatever this browser has already been granted.
 *
 * The recent list is built from grants the server issued, and each one is
 * re-read from the store — a grant naming an order that no longer exists shows
 * nothing.
 */
export default async function OrdersPage() {
  await seedTrackingFixtures();

  const references = await grantedReferences();
  const recent = (
    await Promise.all(references.map((reference) => orderRepository.findOrder(reference)))
  ).filter((order) => order !== undefined);

  const showFixtures = demoOrdersEnabled();

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <div className={styles.intro}>
          <Breadcrumbs className={styles.crumbs} items={[{ label: "Orders" }]} />
          <h1 className={styles.title}>Track an order</h1>
          <p className={styles.description}>
            Enter the order reference and the email it was placed with.
          </p>
        </div>

        <div className={styles.layout}>
          <OrderLookupForm />

          <aside className={styles.side}>
            {recent.length > 0 && (
              <section aria-labelledby="recent-orders">
                <h2 className={styles.sideTitle} id="recent-orders">
                  Your recent orders
                </h2>
                <ul className={styles.list}>
                  {recent.map((order) => (
                    <li key={order.reference}>
                      <Link
                        href={`/orders/${order.reference}`}
                        className={`u-plain ${styles.entry}`}
                      >
                        <span className={styles.entryRef}>{order.reference}</span>
                        <span className={styles.entryStatus}>
                          {ORDER_STATUS_LABEL[order.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {showFixtures && (
              /*
               * Development only. These are the seven seeded scenarios, listed
               * so the tracking experience can be reviewed against states that
               * genuinely occur. None of them is a real order, and the page
               * they open says so.
               */
              <section aria-labelledby="demo-orders" className={styles.demo}>
                <h2 className={styles.sideTitle} id="demo-orders">
                  Demonstration orders
                </h2>
                <p className={styles.demoNote}>
                  Development fixtures, not real manufacturing records. Look any
                  of them up with {FIXTURE_EMAIL}.
                </p>
                <ul className={styles.list}>
                  {FIXTURE_REFERENCES.map((fixture) => (
                    <li key={fixture.reference}>
                      <span className={styles.entry}>
                        <span className={styles.entryRef}>{fixture.reference}</span>
                        <span className={styles.entryStatus}>{fixture.label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
