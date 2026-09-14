/**
 * Generates the committed demo models.
 *
 * Built parametrically with three's own extruder and written as binary STL, so
 * nothing is downloaded and every asset is reproducible from this script.
 */
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const exporter = new STLExporter();

function write(name, geometry) {
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const data = exporter.parse(mesh, { binary: true });
  const buffer = Buffer.from(data.buffer ?? data);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, buffer);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  const size = new THREE.Vector3();
  b.getSize(size);
  console.log(
    `${name.padEnd(24)} ${String(buffer.length).padStart(8)} bytes  ` +
      `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`,
  );
}

function bore(shape, radius) {
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

/* ---- spur gear: 24 teeth, 6 mm bore, 8 mm thick ---- */
function gear({ teeth = 24, pitch = 22, depth = 3, boreRadius = 3, thickness = 8 }) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // Trapezoidal tooth: root, flank up, tip, flank down.
    const pts = [
      [a + step * 0.06, pitch - depth],
      [a + step * 0.2, pitch + depth],
      [a + step * 0.36, pitch + depth],
      [a + step * 0.5, pitch - depth],
      [a + step * 0.94, pitch - depth],
    ];
    for (const [angle, r] of pts) {
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0 && angle === pts[0][0]) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  bore(shape, boreRadius);

  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
}

/*
 * The L bracket (cable-bracket.stl) was removed in the content reset. Its only
 * hole ran along the inside of the 4 mm leg, leaving 0.4 mm walls and no fixing
 * hole through the part, so it was not a part worth publishing as drawn.
 */

/* ---- hex coupler: hex outer, round bore, tall ---- */
function coupler({ across = 11, boreRadius = 4, height = 34 }) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * across;
    const y = Math.sin(a) * across;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  bore(shape, boreRadius);

  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
}

/* ---- framing stress cases ---- */
function plate() {
  // Very flat: exercises framing when one axis is near zero.
  // Authored Z-up like a CAD export, so thickness is the Z axis.
  return new THREE.BoxGeometry(120, 90, 1.5);
}

function tiny() {
  return new THREE.BoxGeometry(0.4, 0.4, 0.4);
}

function huge() {
  return new THREE.SphereGeometry(4200, 48, 32);
}

/* ------------------------------------------------------------------ *
 * Multi-component assembly
 *
 * The exploded view needs a model that genuinely declares parts. This builds
 * one from the same parametric primitives, with one named object per part, and
 * writes it Y-up because that is what glTF and OBJ define.
 * ------------------------------------------------------------------ */

/** Bakes the CAD Z-up authoring convention into Y-up file coordinates. */
function upright(geometry) {
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function named(name, geometry, position) {
  const mesh = new THREE.Mesh(upright(geometry), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

/**
 * A three-pinion planetary carrier.
 *
 * Parts are arranged the way they assemble: the carrier plate at the bottom,
 * three pinions on their pitch circle, the sun gear on the axis, and a cap over
 * the top. No dimension here is a manufacturing specification.
 */
function planetaryCarrier() {
  const group = new THREE.Group();
  group.name = "Planetary Carrier";

  const plate = new THREE.CylinderGeometry(30, 30, 5, 32);
  plate.rotateX(Math.PI / 2); // undone by upright(), leaving a flat disc
  group.add(named("Carrier Plate", plate, [0, 0, 0]));

  group.add(named("Sun Gear", gear({ teeth: 16, pitch: 11, depth: 1.6, boreRadius: 3, thickness: 8 }), [0, 6.5, 0]));

  const pitchRadius = 18;
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    group.add(
      named(
        `Pinion ${i + 1}`,
        gear({ teeth: 10, pitch: 7, depth: 1.4, boreRadius: 2, thickness: 8 }),
        [Math.cos(angle) * pitchRadius, 6.5, Math.sin(angle) * pitchRadius],
      ),
    );
  }

  // A ring rather than a solid lid, so the assembled part still shows that
  // there is something inside it.
  const capShape = new THREE.Shape();
  capShape.absarc(0, 0, 30, 0, Math.PI * 2, false);
  bore(capShape, 13);
  const cap = new THREE.ExtrudeGeometry(capShape, { depth: 4, bevelEnabled: false });
  group.add(named("Retaining Cap", cap, [0, 17, 0]));

  return group;
}

/**
 * The glTF exporter assembles the binary chunk through a FileReader, which is a
 * browser API. Node has Blob but not the reader, so this supplies the one
 * method the exporter calls. It touches nothing about the exported geometry.
 */
function installFileReader() {
  if (globalThis.FileReader) return;

  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((error) => {
          this.onerror?.(error);
        });
    }
  };
}

async function writeGltf(name, object) {
  installFileReader();
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const data = await new GLTFExporter().parseAsync(object, { binary: true });
  const buffer = Buffer.from(data);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, buffer);
  console.log(
    `${name.padEnd(24)} ${String(buffer.length).padStart(8)} bytes  ` +
      `${object.children.length} components`,
  );
}

async function writeObj(name, object) {
  const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
  const text = new OBJExporter().parse(object);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, text, "utf8");
  console.log(
    `${name.padEnd(24)} ${String(Buffer.byteLength(text)).padStart(8)} bytes  ` +
      `${object.children.length} components`,
  );
}

const set = process.argv[3] ?? "product";

if (set === "product") {
  write("spur-gear-24t.stl", gear({}));
  write("hex-shaft-spacer.stl", coupler({}));
  await writeGltf("planetary-gear-set.glb", planetaryCarrier());
} else if (set === "assembly") {
  await writeGltf("assembly.glb", planetaryCarrier());
  await writeObj("assembly.obj", planetaryCarrier());
} else {
  write("plate-flat.stl", plate());
  write("tiny.stl", tiny());
  write("huge.stl", huge());
}
