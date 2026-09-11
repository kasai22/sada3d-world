/**
 * JSON for an inline `<script>` element.
 *
 * `JSON.stringify` produces valid JSON, not safe HTML. Inside
 * `<script type="application/ld+json">` the browser's HTML parser ends the
 * element at the first `</script>` it sees -- including one inside a JSON
 * string -- and whatever follows is parsed as markup. A product name reading
 * `</script><script>...</script>` would run as inline script, and the
 * Content-Security-Policy allows inline script (see `headers.ts`), so the CSP
 * would not stop it.
 *
 * The characters that can break out of the element, or confuse a parser
 * reading it, are written as JSON unicode escapes instead. `<`, `>` and `&`
 * only ever occur inside JSON strings, where `<` means exactly `<`, so a
 * JSON consumer reads the same value. U+2028 and U+2029 (line and paragraph
 * separator) are escaped because older JavaScript engines treat them as line
 * terminators.
 *
 * Catalog text is authored by CMS operators, not customers. That is a smaller
 * group, not a trusted input: an operator account can be compromised, and
 * the page this renders on is served to every visitor.
 *
 * This file is ASCII only. The two separators are built from their code points
 * so that no invisible character can be mistaken for a space in review.
 */

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), "g");

export function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}
