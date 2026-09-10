/**
 * File size formatting.
 *
 * One formatter, like `formatINR` is for money, so an upload zone and an
 * account design card never round the same file differently.
 *
 * It lives in `lib` rather than beside the upload control because the control
 * is a client component, and a Server Component that imported a plain function
 * from a `"use client"` module would be importing a client reference it cannot
 * call.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
