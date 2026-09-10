import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Environment files, for scripts that run outside Next.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * `next dev` and `next build` read `.env` themselves, so the application has
 * never needed this. The command-line tools do not: `tsx src/lib/db/cli/…`
 * is a plain Node process, and a plain Node process knows nothing about a
 * `.env` file sitting next to it.
 *
 * The failure that produced this module was `npm run db:migrate` reporting
 * "DATABASE_URL is not set" on a machine where `npm run dev` connected to the
 * database perfectly well — the variable was there, and the migration runner
 * was simply the only thing not reading it.
 *
 * ── Precedence ───────────────────────────────────────────────────────────
 *
 * The same order Next uses, so a value cannot mean one thing to the app and
 * another to a migration:
 *
 *   1. the real environment   always wins — CI and a deployment set variables
 *                             directly, and a stray committed file must never
 *                             be able to override them
 *   2. .env.local             a developer's own overrides
 *   3. .env                   the shared defaults
 *
 * Implemented by never overwriting a key that is already set: the files are
 * read most-specific first, so the first file to define a key is the one that
 * wins, and anything already in `process.env` beats all of them.
 *
 * ── What it does not do ──────────────────────────────────────────────────
 *
 * No interpolation, no `${VAR}` expansion, no multi-line values. A connection
 * string and a secret are single-line scalars, and a parser that tried to do
 * more would be a parser with more ways to misread a credential.
 */

/** Most specific first. The first file to define a key wins. */
const ENV_FILES = [".env.local", ".env"] as const;

/**
 * One `KEY=VALUE` line, or nothing.
 *
 * Tolerates the shapes people actually write: `export KEY=value`, surrounding
 * quotes, trailing comments after an unquoted value, and blank or commented
 * lines.
 */
function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;

  const separator = withoutExport.indexOf("=");
  if (separator <= 0) return null;

  const key = withoutExport.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = withoutExport.slice(separator + 1).trim();

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
    value = value.slice(1, -1);
  } else {
    /*
     * An unquoted value ends at the first ` #`. Quoted values keep everything,
     * which matters: a password may legitimately contain a hash.
     */
    const comment = value.indexOf(" #");
    if (comment !== -1) value = value.slice(0, comment).trim();
  }

  return [key, value];
}

export interface LoadedEnv {
  /** Files that existed and were read, in the order they were applied. */
  files: string[];
  /** Names of the variables this call set. Never their values. */
  applied: string[];
}

/**
 * Loads the env files into `process.env`.
 *
 * Idempotent and safe to call more than once: a key already present is left
 * alone, so a second call changes nothing.
 */
export function loadEnvFiles(cwd = process.cwd()): LoadedEnv {
  const files: string[] = [];
  const applied: string[] = [];

  for (const name of ENV_FILES) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;

    let contents: string;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      // An unreadable env file is not worth failing a command over; the
      // variable it held will be reported missing by whatever needed it.
      continue;
    }

    files.push(name);

    for (const line of contents.split(/\r?\n/)) {
      const entry = parseLine(line);
      if (!entry) continue;

      const [key, value] = entry;
      // The real environment, and any earlier file, win.
      if (process.env[key] !== undefined) continue;

      process.env[key] = value;
      applied.push(key);
    }
  }

  return { files, applied };
}

/**
 * Loads the files and says what happened, in one line.
 *
 * Names only — never a value. A CLI that printed a connection string would put
 * a password in every terminal scrollback and CI log that ran it.
 */
export function loadEnvForCli(): void {
  const { files } = loadEnvFiles();

  if (files.length > 0) {
    console.log(`Loaded environment from ${files.join(", ")}`);
  }
}
