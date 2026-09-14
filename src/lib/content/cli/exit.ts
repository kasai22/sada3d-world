/**
 * Ends a content CLI once its output has flushed.
 *
 * Payload's database adapter and Next's cache module leave handles open after
 * `payload.destroy()`, so a finished command would otherwise sit until killed —
 * which a script or CI step reads as a hang. The exit code set by the command is
 * preserved.
 */
export function exitWhenFlushed(): void {
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
}
