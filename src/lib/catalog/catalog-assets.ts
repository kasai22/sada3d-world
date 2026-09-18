import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { ModelAsset } from "@/content/catalog/types";
import { checkManufacturability, configuredConstraints } from "@/lib/manufacturing/manufacturability";
import { analyzeModel } from "@/lib/models";

/**
 * Catalog model and image files, verified from disk (Stage 20). Server only.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 *
 * The seed's models are verified by a test against a hand-written list
 * (`content/catalog/models.ts`). A product an administrator creates cannot be
 * in that list, so it could never pass technical validation without a code
 * change. Instead, every file under `public/models/` is verified here with the
 * same rules, at runtime:
 *
 *   STL, OBJ, 3MF   parsed and measured by the geometry analyser; a closed,
 *                   finite mesh that fits the approved build volume
 *   GLB             a structurally valid glTF 2.0 binary whose parts have
 *                   finite position bounds (the same checks as the seed test)
 *   anything else   not verified — fail closed
 *
 * Nothing is uploaded or written. Catalog files still arrive with a deployment
 * (\`public/models/\`, \`public/catalog/<slug>/\`) until Payload Media has a storage
 * adapter; what no longer needs a deployment is the product record itself.
 */

export interface CatalogAssets {
  /** Model files that passed verification, as ModelAsset records. */
  models: readonly ModelAsset[];
  /** Every file under public/catalog, as "/catalog/…" paths. */
  mediaFiles: ReadonlySet<string>;
  /** Model files that failed, and why. */
  rejectedModels: readonly { url: string; reason: string }[];
}

const MODELS_DIR = ["public", "models"];
const CATALOG_DIR = ["public", "catalog"];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(directory, entry.name)) : Promise.resolve([join(directory, entry.name)]))),
  );
  return nested.flat();
}

function toUrl(root: string, file: string): string {
  return `/${relative(join(root, "public"), file).split(sep).join("/")}`;
}

/** Verifies one GLB with the seed test's structural rules. */
function verifyGlb(bytes: Buffer): { ok: true; partCount: number; envelopeMm: ModelAsset["envelopeMm"] } | { ok: false; reason: string } {
  if (bytes.length < 20 || bytes.subarray(0, 4).toString("ascii") !== "glTF") return { ok: false, reason: "not a glTF binary" };
  if (bytes.readUInt32LE(4) !== 2) return { ok: false, reason: "not glTF version 2" };
  if (bytes.readUInt32LE(8) !== bytes.length) return { ok: false, reason: "declared length does not match the file" };
  let gltf: { nodes?: { mesh?: number; matrix?: number[] }[]; meshes?: { primitives: { attributes: { POSITION?: number } }[] }[]; accessors?: { min?: number[]; max?: number[] }[] };
  try {
    gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  } catch {
    return { ok: false, reason: "the JSON chunk does not parse" };
  }
  const parts = (gltf.nodes ?? []).filter((node) => node.mesh !== undefined);
  if (parts.length === 0) return { ok: false, reason: "it contains no mesh nodes" };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of parts) {
    const position = gltf.meshes?.[node.mesh!]?.primitives?.[0]?.attributes.POSITION;
    const accessor = position === undefined ? undefined : gltf.accessors?.[position];
    if (!accessor?.min || !accessor.max) return { ok: false, reason: "a part has no position bounds" };
    const offset = node.matrix ? [node.matrix[12] ?? 0, node.matrix[13] ?? 0, node.matrix[14] ?? 0] : [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      if (!Number.isFinite(accessor.min[axis]) || !Number.isFinite(accessor.max[axis])) return { ok: false, reason: "non-finite position bounds" };
      min[axis] = Math.min(min[axis]!, accessor.min[axis]! + offset[axis]!);
      max[axis] = Math.max(max[axis]!, accessor.max[axis]! + offset[axis]!);
    }
  }
  return { ok: true, partCount: parts.length, envelopeMm: { x: max[0]! - min[0]!, y: max[1]! - min[1]!, z: max[2]! - min[2]! } };
}

const round = (value: number) => Math.round(value * 100) / 100;

export async function verifyCatalogAssets(root: string = process.cwd()): Promise<CatalogAssets> {
  const models: ModelAsset[] = [];
  const rejectedModels: { url: string; reason: string }[] = [];
  const constraints = configuredConstraints();

  for (const file of await listFiles(join(root, ...MODELS_DIR))) {
    const url = toUrl(root, file);
    const extension = file.split(".").pop()?.toLowerCase() ?? "";
    const bytes = await readFile(file);

    if (extension === "glb") {
      const result = verifyGlb(bytes);
      if (!result.ok) rejectedModels.push({ url, reason: result.reason });
      else models.push({ url, format: "glb", sizeBytes: bytes.length, partCount: result.partCount, envelopeMm: result.envelopeMm, source: "verified from file (glTF structure)" });
      continue;
    }

    if (extension !== "stl" && extension !== "obj" && extension !== "3mf") {
      rejectedModels.push({ url, reason: `.${extension} files are not verified` });
      continue;
    }

    try {
      const analysis = await analyzeModel({ fileName: file, bytes: new Uint8Array(bytes) });
      const assessment = checkManufacturability(analysis, constraints);
      const blocking = assessment.findings.filter((finding) => finding.severity === "blocking");
      if (analysis.warnings.some((warning) => warning.code === "non_finite_coordinates")) {
        rejectedModels.push({ url, reason: "it has non-finite coordinates" });
      } else if (blocking.length > 0) {
        rejectedModels.push({ url, reason: blocking.map((finding) => finding.message).join(" ") });
      } else if (extension === "stl" || extension === "obj") {
        const size = analysis.boundingBox.size;
        models.push({
          url,
          format: extension,
          sizeBytes: bytes.length,
          partCount: analysis.objectCount,
          envelopeMm: { x: round(size.x), y: round(size.y), z: round(size.z) },
          source: "verified from file (geometry analysis)",
        });
      } else {
        // 3MF is analysable, but the product model field has no 3mf format for the viewer.
        rejectedModels.push({ url, reason: "3MF models are analysed but the 3D viewer does not render them" });
      }
    } catch (error) {
      rejectedModels.push({ url, reason: `it could not be analysed: ${(error as Error).message}` });
    }
  }

  const mediaFiles = new Set((await listFiles(join(root, ...CATALOG_DIR))).map((file) => toUrl(root, file)));
  return { models, mediaFiles, rejectedModels };
}

/*
 * Files are part of the deployment, so they cannot change under a running
 * server. One verification per process, refreshed only if the directories
 * change (development, where files are added without a restart).
 */
let cached: { key: string; assets: Promise<CatalogAssets> } | undefined;

export async function catalogAssets(root: string = process.cwd()): Promise<CatalogAssets> {
  const mtime = async (parts: string[]) => (await stat(join(root, ...parts)).catch(() => undefined))?.mtimeMs ?? 0;
  const key = `${root}|${await mtime(MODELS_DIR)}|${await mtime(CATALOG_DIR)}`;
  if (!cached || cached.key !== key) cached = { key, assets: verifyCatalogAssets(root) };
  return cached.assets;
}
