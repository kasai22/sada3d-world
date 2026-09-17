import Link from "next/link";

import { formatCost } from "@/components/ops/inventory/display";
import { Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import type { ExpectedConsumption as Expected } from "@/lib/inventory/expected";
import { rupees } from "@/lib/inventory/rules";

import styles from "./page.module.css";

/**
 * Expected inputs for the catalog lines on an order (Stage 22.7).
 *
 * The products' defined per-unit consumption × the ordered quantity. A plan
 * only: nothing here is recorded against stock, and actual usage stays in the
 * inventory ledger.
 */
export function ExpectedConsumption({ expected }: { expected: Expected }) {
  const { inputs, covered, undefinedFor, totalCostPaise } = expected;
  return (
    <Panel
      id="expected-consumption"
      title="Expected consumption"
      titleAs="h3"
      meta="Plan · not deducted"
      className={styles.job}
      padded={false}
    >
      <p className={styles.expectedLead}>
        What the catalog lines on this order would use if made, from each product&apos;s Production &amp;
        Consumption. Stock is not changed; actual usage is recorded in{" "}
        <Link href="/admin/inventory?tab=movements" className={styles.inlineLink}>
          inventory movements
        </Link>
        .
      </p>
      {inputs.length > 0 && (
        <TableFrame flush label="Expected consumption" caption="Expected inputs across the order">
          <thead>
            <tr>
              <Th>Input</Th>
              <Th align="right">Expected</Th>
              <Th align="right" hide="sm">
                Est. cost
              </Th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((input) => (
              <Tr key={input.inventoryItemId}>
                <Td>
                  <Stack primary={input.name} secondary={input.sku ? `${input.typeLabel} · ${input.sku}` : input.typeLabel} />
                </Td>
                <Td align="right" mono nowrap>
                  {input.display}
                </Td>
                <Td align="right" mono nowrap hide="sm" muted={input.costPaise === null}>
                  {input.costPaise === null ? "Cost unavailable" : formatCost(rupees(input.costPaise))}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}
      <p className={styles.expectedLead}>
        {covered.length > 0 && <>Includes {covered.join(", ")}. </>}
        {undefinedFor.length > 0 && <>No manufacturing inputs defined yet for {undefinedFor.join(", ")}. </>}
        {inputs.length > 0 &&
          (totalCostPaise === null
            ? "Estimated input cost unavailable: an input has no recorded cost."
            : `Estimated input cost ${formatCost(rupees(totalCostPaise))} — an estimate, not a price.`)}
      </p>
    </Panel>
  );
}
