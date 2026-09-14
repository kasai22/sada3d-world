import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { GENERATED_DOCS } from "../docs";

/**
 * `npm run content:docs`            regenerate the commercial catalog documents
 * `npm run content:docs -- --check` fail if any committed document is stale
 *
 * The documents are views of `src/content/catalog`; see `lib/content/docs.ts`.
 * No database, no environment.
 */
const check = process.argv.includes("--check");
let stale = 0;

for (const doc of GENERATED_DOCS) {
  const path = resolve(process.cwd(), doc.path);
  const rendered = doc.render();
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // Absent: stale by definition.
  }

  if (current === rendered) {
    console.log(`up to date  ${doc.path}`);
  } else if (check) {
    console.error(`STALE       ${doc.path} — run npm run content:docs`);
    stale += 1;
  } else {
    writeFileSync(path, rendered, "utf8");
    console.log(`written     ${doc.path}`);
  }
}

process.exitCode = stale > 0 ? 1 : 0;
