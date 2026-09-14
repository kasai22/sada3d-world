import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Content backups, taken before anything is deleted.
 *
 * ── What is in one ───────────────────────────────────────────────────────
 *
 * Two copies of the same content, because they recover different failures:
 *
 *   tables      every row of every Payload content table, including the
 *               version and array tables — a full-fidelity copy that can be
 *               re-inserted exactly
 *   documents   the same content as Payload documents, drafts included — the
 *               readable copy, and the one to re-create records through the CMS
 *
 * Only content. The table filter admits products, categories, materials, media
 * and the homepage global and nothing else: no users, sessions or preferences,
 * and none of the application's customer or order tables. A backup file holds
 * no secret and no personal data.
 *
 * ── Why it verifies itself ───────────────────────────────────────────────
 *
 * A reset that deletes after a backup that silently failed has no backup.
 * `writeContentBackup` re-reads what it wrote and compares row counts and the
 * checksum; the reset does not proceed unless that comparison holds.
 */

/** Payload's tables for the content collections and the homepage global. */
const CONTENT_TABLE = /^_?(products|categories|materials|media|homepage)(_|$)/;

export function isContentTable(name: string): boolean {
  return CONTENT_TABLE.test(name);
}

export function backupName(now: Date): string {
  return `sada3d-content-pre-reset-${now.toISOString().replace(/[:.]/g, "-")}`;
}

export interface ContentBackup {
  kind: "sada3d-content-backup";
  version: 1;
  createdAt: string;
  /** Host and database name; never credentials. */
  database: string;
  tables: Record<string, unknown[]>;
  documents: Record<string, unknown[]>;
}

export interface BackupSource {
  listTables(): Promise<string[]>;
  readTable(name: string): Promise<unknown[]>;
  readDocuments(): Promise<Record<string, unknown[]>>;
}

export async function collectContentBackup(
  source: BackupSource,
  database: string,
  now: Date,
): Promise<ContentBackup> {
  const tables: Record<string, unknown[]> = {};

  for (const name of (await source.listTables()).filter(isContentTable).sort()) {
    tables[name] = await source.readTable(name);
  }

  return {
    kind: "sada3d-content-backup",
    version: 1,
    createdAt: now.toISOString(),
    database,
    tables,
    documents: await source.readDocuments(),
  };
}

export function rowCounts(backup: Pick<ContentBackup, "tables">): Record<string, number> {
  return Object.fromEntries(
    Object.entries(backup.tables).map(([name, rows]) => [name, rows.length]),
  );
}

export interface WrittenBackup {
  file: string;
  sha256: string;
  counts: Record<string, number>;
}

export class BackupVerificationError extends Error {}

/**
 * Writes the backup and proves it can be read back intact.
 *
 * Throws rather than returning a flag: the caller is about to delete content,
 * and an exception is the one outcome it cannot accidentally ignore.
 */
export function writeContentBackup(
  directory: string,
  backup: ContentBackup,
  now: Date,
): WrittenBackup {
  mkdirSync(directory, { recursive: true });

  // Dates and bigints serialise predictably; anything else unusual is a bug.
  const body = JSON.stringify(
    backup,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  const file = join(directory, `${backupName(now)}.json`);
  const sha256 = createHash("sha256").update(body).digest("hex");

  writeFileSync(file, body, "utf8");

  const reread = readFileSync(file, "utf8");
  if (createHash("sha256").update(reread).digest("hex") !== sha256) {
    throw new BackupVerificationError(`The backup at ${file} did not read back byte-for-byte.`);
  }

  const parsed = JSON.parse(reread) as ContentBackup;
  const expected = rowCounts(backup);
  const actual = rowCounts(parsed);

  for (const [name, count] of Object.entries(expected)) {
    if (actual[name] !== count) {
      throw new BackupVerificationError(
        `The backup at ${file} holds ${actual[name] ?? 0} rows of ${name}; ${count} were read.`,
      );
    }
  }

  return { file, sha256, counts: expected };
}
