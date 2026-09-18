import type { ImportSummary } from "../import";

/** Returns false when the import refused to run. */
export function printImportSummary(summary: ImportSummary): boolean {
  if (summary.problems.length > 0) {
    console.error("The content plan does not hold together. Nothing was written:");
    for (const problem of summary.problems) {
      console.error(`  ${problem.subject}: ${problem.reason}`);
    }
    return false;
  }

  const line = (name: string, c: ImportSummary["products"]) =>
    `  ${name.padEnd(11)} ${c.created} created · ${c.updated} updated · ${c.unchanged} unchanged · ` +
    `${c.published} published · ${c.drafts} draft · ${c.deleted} deleted · ${c.unpublished} unpublished`;

  console.log(`Import (${summary.mode}):`);
  console.log(line("categories", summary.categories));
  console.log(line("materials", summary.materials));
  console.log(line("products", summary.products));
  console.log(`  price approvals: ${summary.priceApprovalsCreated} created (append-only; never updated or deleted)`);
  console.log(
    `  admin categories: ${summary.adminManagedCategories.length} left untouched${summary.adminManagedCategories.length ? ` (${summary.adminManagedCategories.join(", ")})` : ""}`,
  );
  console.log(
    `  admin-managed:   ${summary.adminManaged.length} product(s) left untouched${summary.adminManaged.length ? ` (${summary.adminManaged.join(", ")})` : ""}`,
  );

  if (summary.stale.length > 0) {
    console.log(`\nStale documents (${summary.stale.length}):`);
    for (const decision of summary.stale) {
      console.log(
        `  ${decision.collection.padEnd(10)} ${decision.key.padEnd(24)} ${decision.action.padEnd(9)} ${decision.reason}`,
      );
    }
  }

  return true;
}
