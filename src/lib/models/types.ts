import type { AnalyzableFormat, AnalysisWarning, UnitResolution } from "@/lib/geometry/types";

/**
 * Model parsing.
 *
 * Every parser produces the same neutral shape — triangles as plain numbers,
 * objects as a list — so the analyser is written once and knows nothing about
 * file formats.
 *
 * ── Why not three.js ─────────────────────────────────────────────────────
 *
 * The viewer uses three.js loaders and will keep doing so: they produce a scene
 * graph, which is what rendering needs. Analysis needs neither a scene nor a
 * WebGL context, and it has to run on a server and inside a test where neither
 * exists. So the analysis pipeline parses to arrays and the rendering pipeline
 * parses to a scene, from the same file, for different purposes.
 *
 * That is two parsers for 3MF, and the duplication is deliberate: the
 * alternative is a headless WebGL dependency on the server to count triangles.
 */

/**
 * One mesh: a flat list of triangle vertices.
 *
 * Nine numbers per triangle — three vertices, xyz each — already resolved from
 * whatever indexing the source format used. Positions are in the file's own
 * unit; conversion to millimetres happens in the analyser, once, using
 * `ParsedModel.unit`.
 */
export interface ParsedMesh {
  /** The file's own name for this mesh, where it has one. Never invented. */
  name?: string;
  positions: Float64Array;
}

/**
 * One object the file declares as a separate thing.
 *
 * For 3MF this is a `<object>` in the model. For STL, which has no concept of
 * objects, it is the single implicit object — represented as one rather than
 * pretending the format has structure it does not.
 */
export interface ParsedObject {
  id: string;
  name?: string;
  meshes: ParsedMesh[];
}

/**
 * Metadata a file declares about itself.
 *
 * Only entries the core specification defines are read. A slicer's private
 * extension is recorded as unsupported rather than guessed at — see
 * `unsupportedNamespaces`.
 */
export interface ModelMetadata {
  /** Core 3MF metadata: Title, Designer, Description, Application, and so on. */
  entries: Readonly<Record<string, string>>;
  /**
   * Namespaces the file uses that this parser does not implement.
   *
   * Reported, never interpreted. A production extension or a vendor's private
   * one may change what the geometry means, and a parser that ignored that
   * silently would report measurements for a model it had only partly
   * understood.
   */
  unsupportedNamespaces: readonly string[];
}

export interface ParsedModel {
  format: AnalyzableFormat;
  /** Content-derived. The same bytes always give the same identity. */
  identity: string;
  unit: UnitResolution;
  objects: ParsedObject[];
  metadata: ModelMetadata;
  /** Problems found while parsing that the analyser should carry forward. */
  warnings: AnalysisWarning[];
}

/**
 * The parser contract.
 *
 * `validate` is cheap and runs first: extension, size, and the container's own
 * structure. `parse` is the expensive part and is only reached by input that
 * has already been found well-formed.
 */
export interface ModelParser {
  readonly format: AnalyzableFormat;
  /** Extensions this parser claims, lowercase and dotted. */
  readonly extensions: readonly string[];
  /**
   * Checks what can be checked without full parsing.
   *
   * Throws `ModelParseError` with a message written for a customer.
   */
  validate(input: ModelInput): void;
  parse(input: ModelInput): Promise<ParsedModel>;
}

/**
 * Bytes plus the little that is known about them.
 *
 * A `File` is not used: this has to work on a server, where there is no File,
 * and in a test, where there is no browser. The route handler and the browser
 * both reduce what they have to this.
 */
export interface ModelInput {
  /** The claimed filename. Used for its extension and for nothing else. */
  fileName: string;
  bytes: Uint8Array;
  /** The declared content type, where the transport supplied one. */
  contentType?: string;
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}
