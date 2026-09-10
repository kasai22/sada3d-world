import { ModelParseError } from "@/lib/errors";

/**
 * A small XML scanner for the 3MF subset.
 *
 * ── Why not a parser library ─────────────────────────────────────────────
 *
 * The document is machine-written, its shape is fixed by a specification, and
 * the only thing this needs from it is elements and attributes. What a general
 * XML parser adds beyond that is mostly the parts that are dangerous: DTDs,
 * entity resolution and external references.
 *
 * ── What it refuses ──────────────────────────────────────────────────────
 *
 *   DOCTYPE          rejected outright. A document type declaration is how both
 *                    the billion-laughs expansion and external-entity retrieval
 *                    get in, and a 3MF model has no legitimate use for one.
 *
 *   ENTITIES         only the five XML predefined entities and numeric
 *                    character references are resolved. An `&custom;` is left
 *                    as written rather than looked up, because looking it up is
 *                    the vulnerability.
 *
 *   SIZE             the document is capped before scanning, and the element
 *                    count is capped during it.
 *
 * Processing instructions and comments are skipped. CDATA is read as text.
 */

/** Elements one document may contain. Well past any real model. */
const MAX_ELEMENTS = 4_000_000;

export interface XmlElement {
  name: string;
  /** Namespace prefix, where the name carried one. */
  prefix?: string;
  attributes: Record<string, string>;
  /** True for `<tag/>`. */
  selfClosing: boolean;
}

export type XmlVisitor = {
  /** Called for every start tag and every self-closing tag. */
  onOpen?(element: XmlElement, path: readonly string[]): void;
  onClose?(name: string, path: readonly string[]): void;
  /** Text between tags, already entity-decoded. */
  onText?(text: string, path: readonly string[]): void;
};

const PREDEFINED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Resolves only what is safe to resolve.
 *
 * The five predefined entities and numeric character references. Anything else
 * is returned as it was written — an unknown entity is not an error worth
 * failing a model over, and it is certainly not something to go and fetch.
 */
export function decodeXmlText(value: string): string {
  if (!value.includes("&")) return value;

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);

      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      // Surrogate halves are not characters and String.fromCodePoint throws.
      if (code >= 0xd800 && code <= 0xdfff) return whole;

      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }

    return PREDEFINED[body] ?? whole;
  });
}

const ATTRIBUTE = /([A-Za-z_:][-\w.:]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(source)) !== null) {
    const name = match[1];
    const value = match[3] ?? match[4] ?? "";
    if (name) attributes[name] = decodeXmlText(value);
  }

  return attributes;
}

/**
 * Walks the document, calling the visitor.
 *
 * Streaming rather than building a tree: a model with two million triangles
 * would otherwise become two million objects before any of it was read, and the
 * consumer only ever needs one element at a time.
 */
export function scanXml(source: string, visitor: XmlVisitor): void {
  if (/<!DOCTYPE/i.test(source)) {
    throw new ModelParseError(
      "This model declares a document type, which is not accepted.",
    );
  }

  const path: string[] = [];
  let cursor = 0;
  let elements = 0;

  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);

    if (open === -1) break;

    if (open > cursor) {
      const text = source.slice(cursor, open);
      if (visitor.onText && text.trim().length > 0) {
        visitor.onText(decodeXmlText(text), path);
      }
    }

    // Comments, CDATA and processing instructions.
    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      cursor = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      const text = source.slice(open + 9, end === -1 ? source.length : end);
      if (visitor.onText && text.length > 0) visitor.onText(text, path);
      cursor = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith("<?", open)) {
      const end = source.indexOf("?>", open + 2);
      cursor = end === -1 ? source.length : end + 2;
      continue;
    }

    const close = source.indexOf(">", open);
    if (close === -1) {
      throw new ModelParseError("This model's XML is malformed and could not be read.");
    }

    const raw = source.slice(open + 1, close);
    cursor = close + 1;

    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      path.pop();
      visitor.onClose?.(name, path);
      continue;
    }

    elements += 1;
    if (elements > MAX_ELEMENTS) {
      throw new ModelParseError("This model contains more elements than can be read.");
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;

    const space = body.search(/\s/);
    const qualified = (space === -1 ? body : body.slice(0, space)).trim();
    const attributes = space === -1 ? {} : parseAttributes(body.slice(space));

    const colon = qualified.indexOf(":");
    const element: XmlElement = {
      name: colon === -1 ? qualified : qualified.slice(colon + 1),
      ...(colon === -1 ? {} : { prefix: qualified.slice(0, colon) }),
      attributes,
      selfClosing,
    };

    if (!selfClosing) path.push(element.name);
    visitor.onOpen?.(element, path);
    if (selfClosing) visitor.onClose?.(element.name, path);
  }
}

/** A finite number from an attribute, or undefined. Never NaN, never a guess. */
export function numberAttribute(
  attributes: Record<string, string>,
  name: string,
): number | undefined {
  const raw = attributes[name];
  if (raw === undefined) return undefined;

  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}
