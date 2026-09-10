import { inflateRawSync } from "node:zlib";

import { ModelParseError } from "@/lib/errors";

/**
 * A deliberately small, deliberately strict ZIP reader.
 *
 * A 3MF is a ZIP package, which means an uploaded 3MF is an archive supplied by
 * a stranger. That is the most hostile input this application accepts, and it
 * is read here rather than by a general-purpose library for one reason: every
 * limit below is a decision this project needs to make explicitly, and a
 * library's defaults are not those decisions.
 *
 * ── What this refuses, and why ───────────────────────────────────────────
 *
 *   PATH TRAVERSAL      An entry named `../../etc/passwd` or `C:\x` or one with
 *                       a backslash or a leading slash is rejected outright.
 *                       Nothing here writes to a filesystem, so traversal
 *                       cannot escape anything today — the check exists because
 *                       the day someone adds extraction is the day the absence
 *                       of this check becomes a vulnerability, and by then it
 *                       will not be obvious that it was missing.
 *
 *   DECOMPRESSION BOMB  A few hundred kilobytes can inflate to gigabytes. Every
 *                       entry is capped on its declared uncompressed size, on
 *                       its actual inflated size, and on its compression ratio,
 *                       and the archive is capped on the total inflated across
 *                       all entries. The declared size is not trusted: it is a
 *                       number in the archive, written by whoever built it, so
 *                       the inflated result is measured too.
 *
 *   ENTRY FLOOD         A cap on how many entries the directory may contain, so
 *                       an archive of a million empty files cannot exhaust
 *                       memory through bookkeeping alone.
 *
 *   UNKNOWN METHODS     Store and deflate only. Anything else — including the
 *                       encrypted flag — is refused rather than attempted.
 *
 * ── What it does not do ──────────────────────────────────────────────────
 *
 * It never touches the filesystem. Entries are returned as bytes in memory, on
 * demand, and the caller asks for the ones it needs by name. There is no
 * "extract to a directory" function to misuse.
 */

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

export interface ZipLimits {
  /** Entries the central directory may declare. */
  maxEntries: number;
  /** Bytes any single entry may inflate to. */
  maxEntryBytes: number;
  /** Bytes the whole archive may inflate to across every entry read. */
  maxTotalBytes: number;
  /**
   * Inflated ÷ compressed, checked only on entries past `ratioFloorBytes`.
   *
   * A secondary heuristic, not the main defence. The real guards are the
   * absolute caps above, which bound memory whatever the ratio is.
   *
   * The floor matters: a 3MF model part is thousands of near-identical
   * `<vertex …/>` lines, which is legitimately one of the most compressible
   * things a file can contain. Small entries routinely exceed 200:1 without
   * being an attack, and a bomb is by definition large — so the ratio is only
   * consulted once an entry is big enough for the ratio to mean anything.
   */
  maxCompressionRatio: number;
  /** Below this an entry's ratio is not checked at all. */
  ratioFloorBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 512,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 1000,
  ratioFloorBytes: 4 * 1024 * 1024,
};

/* ------------------------------------------------------------------ *
 * Signatures
 * ------------------------------------------------------------------ */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const EOCD_MIN_SIZE = 22;
/** A ZIP comment is at most 65535 bytes, so the EOCD is within this of the end. */
const EOCD_SEARCH_LIMIT = EOCD_MIN_SIZE + 0xffff;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** Bit 0 of the general-purpose flags. An encrypted entry cannot be read. */
const FLAG_ENCRYPTED = 0x0001;

export interface ZipEntry {
  /** The name as stored, already validated as safe. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  /** Offset of the local file header. */
  localHeaderOffset: number;
}

/* ------------------------------------------------------------------ *
 * Name safety
 * ------------------------------------------------------------------ */

/**
 * Whether an entry name is one this reader will even acknowledge.
 *
 * An allowlist of shapes rather than a blocklist of tricks: a relative POSIX
 * path of ordinary segments. Anything else — absolute, backslashed, dotted,
 * drive-lettered, NUL-bearing, or overlong — is refused without trying to
 * work out what it meant.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return false;

  // A NUL truncates the name for some consumers and not others.
  if (name.includes("\u0000")) return false;

  // Backslashes are path separators on Windows; the ZIP spec says forward only.
  if (name.includes("\\")) return false;

  // Absolute, and the drive-letter form of absolute.
  if (name.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(name)) return false;

  const segments = name.split("/");
  for (const segment of segments) {
    // Trailing slash on a directory entry gives one empty final segment.
    if (segment === "") continue;
    if (segment === "." || segment === "..") return false;
  }

  return true;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Finds the End Of Central Directory record, scanning back from the end. */
function findEocd(bytes: Uint8Array): number {
  if (bytes.length < EOCD_MIN_SIZE) {
    throw new ModelParseError("This file is too small to be a valid 3MF package.");
  }

  const data = view(bytes);
  const earliest = Math.max(0, bytes.length - EOCD_SEARCH_LIMIT);

  for (let offset = bytes.length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
    if (data.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }

  throw new ModelParseError(
    "This file is not a valid ZIP package, so it cannot be read as a 3MF.",
  );
}

/**
 * Reads the central directory.
 *
 * The directory is the archive's own index. Entries whose names are unsafe are
 * refused here, before any of their bytes are touched.
 */
export function readZipDirectory(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): ZipEntry[] {
  const data = view(bytes);
  const eocd = findEocd(bytes);

  const entryCount = data.getUint16(eocd + 10, true);
  const directorySize = data.getUint32(eocd + 12, true);
  const directoryOffset = data.getUint32(eocd + 16, true);

  if (entryCount > limits.maxEntries) {
    throw new ModelParseError(
      `This package contains ${entryCount} entries, above the limit of ${limits.maxEntries}.`,
    );
  }

  if (directoryOffset + directorySize > bytes.length) {
    throw new ModelParseError("This package's index is damaged or truncated.");
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length) {
      throw new ModelParseError("This package's index is damaged or truncated.");
    }

    if (data.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new ModelParseError("This package's index is damaged.");
    }

    const flags = data.getUint16(cursor + 8, true);
    const method = data.getUint16(cursor + 10, true);
    const compressedSize = data.getUint32(cursor + 20, true);
    const uncompressedSize = data.getUint32(cursor + 24, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const extraLength = data.getUint16(cursor + 30, true);
    const commentLength = data.getUint16(cursor + 32, true);
    const localHeaderOffset = data.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    if (nameStart + nameLength > bytes.length) {
      throw new ModelParseError("This package's index is damaged or truncated.");
    }

    const name = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );

    if (!isSafeEntryName(name)) {
      /*
       * Refused for the whole archive, not skipped. A package containing a
       * traversal attempt is not a package with one bad file in it — it is a
       * package built by something that meant to escape, and the rest of its
       * contents have not earned the benefit of the doubt.
       */
      throw new ModelParseError(
        "This package contains an unsafe file path and was not opened.",
      );
    }

    if ((flags & FLAG_ENCRYPTED) !== 0) {
      throw new ModelParseError("This package is encrypted and cannot be read.");
    }

    if (uncompressedSize > limits.maxEntryBytes) {
      throw new ModelParseError(
        "This package declares a file too large to read safely.",
      );
    }

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      localHeaderOffset,
    });

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Reads one entry's bytes.
 *
 * The local header is re-read rather than trusted from the directory, because
 * the two can disagree and the local one is what actually precedes the data.
 * The inflated result is measured against the caps regardless of what either
 * header claimed.
 */
export function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
  budget?: { remaining: number },
): Uint8Array {
  const data = view(bytes);
  const header = entry.localHeaderOffset;

  if (header + 30 > bytes.length) {
    throw new ModelParseError("This package is truncated.");
  }

  if (data.getUint32(header, true) !== LOCAL_SIGNATURE) {
    throw new ModelParseError("This package's contents are damaged.");
  }

  const nameLength = data.getUint16(header + 26, true);
  const extraLength = data.getUint16(header + 28, true);
  const start = header + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;

  if (end > bytes.length) {
    throw new ModelParseError("This package is truncated.");
  }

  const compressed = bytes.subarray(start, end);

  if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
    throw new ModelParseError(
      "This package uses a compression method that is not supported.",
    );
  }

  let inflated: Uint8Array;

  if (entry.method === METHOD_STORE) {
    inflated = compressed;
  } else {
    /*
     * `maxOutputLength` is the actual bomb guard: zlib stops and throws rather
     * than allocating past it, so a 1000:1 entry never reaches memory. Checking
     * the size afterwards would be checking after the damage.
     */
    const ceiling = Math.min(
      limits.maxEntryBytes,
      budget ? Math.max(budget.remaining, 0) : limits.maxEntryBytes,
    );

    if (budget && budget.remaining <= 0) {
      throw new ModelParseError(
        "This package expands to more data than can be read safely.",
      );
    }

    try {
      inflated = inflateRawSync(compressed, { maxOutputLength: ceiling });
    } catch {
      /*
       * zlib stops at the ceiling rather than allocating past it, so the
       * failure is the guard working. Which guard it was decides what to say:
       * a single oversized entry and an archive that has used up its total
       * budget are different problems.
       */
      if (budget && ceiling === budget.remaining) {
        throw new ModelParseError(
          "This package expands to more data than can be read safely.",
        );
      }

      throw new ModelParseError(
        "This package could not be decompressed. It may be damaged, or larger than the limit allows.",
      );
    }
  }

  if (inflated.length > limits.maxEntryBytes) {
    throw new ModelParseError("This package contains a file too large to read safely.");
  }

  if (
    entry.compressedSize > 0 &&
    inflated.length > limits.ratioFloorBytes &&
    inflated.length / entry.compressedSize > limits.maxCompressionRatio
  ) {
    throw new ModelParseError(
      "This package contains a file whose compression ratio is implausible and was not read.",
    );
  }

  if (budget) {
    budget.remaining -= inflated.length;
    if (budget.remaining < 0) {
      throw new ModelParseError(
        "This package expands to more data than can be read safely.",
      );
    }
  }

  return inflated;
}

/** A reader bound to one archive, carrying the shared inflation budget. */
export function openZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS) {
  const entries = readZipDirectory(bytes, limits);
  const budget = { remaining: limits.maxTotalBytes };

  return {
    entries,
    /** Case-insensitive, because package parts are referenced inconsistently. */
    find(name: string): ZipEntry | undefined {
      const wanted = name.toLowerCase().replace(/^\//, "");
      return entries.find((entry) => entry.name.toLowerCase() === wanted);
    },
    read(entry: ZipEntry): Uint8Array {
      return readZipEntry(bytes, entry, limits, budget);
    },
  };
}
