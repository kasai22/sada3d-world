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

/* ---- L bracket with two fixing holes ---- */
function bracket({ length = 34, height = 22, thickness = 4, width = 14 }) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, thickness);
  shape.lineTo(thickness, thickness);
  shape.lineTo(thickness, height);
  shape.lineTo(0, height);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(length - 8, thickness / 2, 1.6, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
}

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

const set = process.argv[3] ?? "product";

if (set === "product") {
  write("precision-gear.stl", gear({}));
  write("cable-bracket.stl", bracket({}));
  write("hex-drive-coupler.stl", coupler({}));
} else {
  write("plate-flat.stl", plate());
  write("tiny.stl", tiny());
  write("huge.stl", huge());
}
