import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";

import { componentForObject, discoverComponents, measureAssembly } from "./components";
import {
  calculateExplosionTransform,
  easeInOutCubic,
  explodeDirection,
  explodeDistance,
} from "./explode";
import type { AssemblyBounds, ViewerComponent } from "./types";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function part(name: string, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}

/** Four parts around the origin, one sitting exactly on it. */
function assemblyFixture(): Group {
  const group = new Group();
  group.name = "Assembly";
  group.add(part("Base", 0, -4, 0));
  group.add(part("Gear", 6, 0, 0));
  group.add(part("Shaft", 0, 0, 0));
  group.add(part("Cover", 0, 5, 0));
  return group;
}

const ASSEMBLY: AssemblyBounds = { center: new Vector3(0, 0, 0), radius: 10 };

const at = (index: number, center: Vector3, position = center.clone()) => ({
  index,
  center,
  rest: { position },
});

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

test("a single mesh is not an assembly", () => {
  assert.deepEqual(discoverComponents(part("Solid", 0, 0, 0)), []);
});

test("a group holding one mesh is not an assembly", () => {
  const group = new Group();
  group.add(part("Solid", 0, 0, 0));
  assert.deepEqual(discoverComponents(group), []);
});

test("children with geometry become components", () => {
  const components = discoverComponents(assemblyFixture());
  assert.equal(components.length, 4);
  assert.deepEqual(
    components.map((component) => component.name),
    ["Base", "Gear", "Shaft", "Cover"],
  );
});

test("wrapper groups are skipped to reach the real assembly root", () => {
  const outer = new Group();
  const inner = new Group();
  inner.add(assemblyFixture());
  outer.add(inner);
  assert.equal(discoverComponents(outer).length, 4);
});

test("empty children are not components", () => {
  const group = assemblyFixture();
  group.add(new Group());
  assert.equal(discoverComponents(group).length, 4);
});

test("a mesh soup is not treated as an assembly", () => {
  const group = new Group();
  for (let i = 0; i < 260; i += 1) group.add(part(`Fragment ${i}`, i, 0, 0));
  assert.deepEqual(discoverComponents(group), []);
});

test("identifiers are stable across loads", () => {
  const first = discoverComponents(assemblyFixture()).map((c) => c.id);
  const second = discoverComponents(assemblyFixture()).map((c) => c.id);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    "assembly/0-base",
    "assembly/1-gear",
    "assembly/2-shaft",
    "assembly/3-cover",
  ]);
});

test("identifiers are unique when names repeat", () => {
  const group = new Group();
  group.add(part("Fastener", 0, 0, 0));
  group.add(part("Fastener", 3, 0, 0));
  const ids = discoverComponents(group).map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
});

test("unnamed parts are numbered rather than left blank", () => {
  const group = new Group();
  group.add(part("", 0, 0, 0));
  group.add(part("", 4, 0, 0));
  const components = discoverComponents(group);
  assert.deepEqual(
    components.map((c) => c.name),
    ["Part 1", "Part 2"],
  );
  assert.deepEqual(
    components.map((c) => c.named),
    [false, false],
  );
});

test("underscored export names read as the names they were authored as", () => {
  const group = new Group();
  group.add(part("Sun_Gear", 0, 0, 0));
  group.add(part("M3-Fastener", 4, 0, 0));
  const components = discoverComponents(group);
  assert.deepEqual(
    components.map((c) => c.name),
    ["Sun Gear", "M3-Fastener"],
  );
  assert.deepEqual(
    components.map((c) => c.named),
    [true, true],
  );
});

test("the rest transform is recorded at discovery", () => {
  const components = discoverComponents(assemblyFixture());
  const gear = components.find((c) => c.name === "Gear");
  assert.ok(gear);
  assert.deepEqual(
    [gear.rest.position.x, gear.rest.position.y, gear.rest.position.z],
    [6, 0, 0],
  );
});

test("a hit on a descendant resolves to its owning component", () => {
  const group = assemblyFixture();
  const components = discoverComponents(group);
  const nested = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  components[1]?.object.add(nested);
  assert.equal(componentForObject(nested, components)?.name, "Gear");
});

test("a hit outside the assembly resolves to nothing", () => {
  const components = discoverComponents(assemblyFixture());
  assert.equal(componentForObject(part("Stray", 0, 0, 0), components), undefined);
});

test("assembly bounds cover every component", () => {
  const bounds = measureAssembly(discoverComponents(assemblyFixture()));
  assert.ok(bounds.radius > 0);
  assert.ok(Number.isFinite(bounds.center.x));
});

/* ------------------------------------------------------------------ *
 * Direction
 * ------------------------------------------------------------------ */

test("direction is radially outward from the assembly centre", () => {
  const direction = explodeDirection(at(0, new Vector3(6, 0, 0)), ASSEMBLY);
  assert.ok(Math.abs(direction.x - 1) < 1e-9);
  assert.ok(Math.abs(direction.y) < 1e-9);
});

test("a component on the centre falls back to a fixed axis", () => {
  const direction = explodeDirection(at(0, new Vector3(0, 0, 0)), ASSEMBLY);
  assert.ok(Math.abs(direction.length() - 1) < 1e-9);
});

test("coaxial components on the centre separate rather than overlap", () => {
  const bolt = explodeDirection(at(0, new Vector3(0, 0, 0)), ASSEMBLY);
  const washer = explodeDirection(at(1, new Vector3(0, 0, 0)), ASSEMBLY);
  assert.ok(bolt.dot(washer) < 0, "the two fell in the same direction");
});

test("direction is identical on every evaluation", () => {
  const component = at(3, new Vector3(0, 0, 0));
  const runs = Array.from({ length: 5 }, () =>
    explodeDirection(component, ASSEMBLY).toArray().join(","),
  );
  assert.equal(new Set(runs).size, 1);
});

/* ------------------------------------------------------------------ *
 * Distance
 * ------------------------------------------------------------------ */

test("outer components travel further than inner ones", () => {
  const inner = explodeDistance(at(0, new Vector3(1, 0, 0)), ASSEMBLY);
  const outer = explodeDistance(at(1, new Vector3(9, 0, 0)), ASSEMBLY);
  assert.ok(outer > inner);
});

test("explosion scales with the assembly, not with absolute units", () => {
  const small = explodeDistance(at(0, new Vector3(1, 0, 0)), {
    center: new Vector3(),
    radius: 1,
  });
  const large = explodeDistance(at(0, new Vector3(1000, 0, 0)), {
    center: new Vector3(),
    radius: 1000,
  });
  assert.ok(Math.abs(large / small - 1000) < 1e-6);
});

test("separation stays within a plausible inspection range", () => {
  const distance = explodeDistance(at(0, new Vector3(10, 0, 0)), ASSEMBLY);
  // Far enough to read, not so far the assembly stops being one object.
  assert.ok(distance < ASSEMBLY.radius * 2, `travelled ${distance}`);
});

/* ------------------------------------------------------------------ *
 * Transform
 * ------------------------------------------------------------------ */

test("at 0 percent the position is exactly the rest position", () => {
  const component = at(1, new Vector3(6, 0, 0), new Vector3(6, 0, 0));
  const { position } = calculateExplosionTransform(component, ASSEMBLY, 0);
  assert.deepEqual(position.toArray(), [6, 0, 0]);
});

test("50 percent is exactly halfway to 100 percent", () => {
  const component = at(1, new Vector3(6, 0, 0), new Vector3(6, 0, 0));
  const rest = component.rest.position;
  const half = calculateExplosionTransform(component, ASSEMBLY, 0.5).position;
  const full = calculateExplosionTransform(component, ASSEMBLY, 1).position;

  const halfTravel = half.clone().sub(rest).length();
  const fullTravel = full.clone().sub(rest).length();
  assert.ok(Math.abs(fullTravel / halfTravel - 2) < 1e-9);
});

test("amount is clamped rather than extrapolated", () => {
  const component = at(1, new Vector3(6, 0, 0), new Vector3(6, 0, 0));
  const over = calculateExplosionTransform(component, ASSEMBLY, 4).position;
  const full = calculateExplosionTransform(component, ASSEMBLY, 1).position;
  assert.deepEqual(over.toArray(), full.toArray());

  const under = calculateExplosionTransform(component, ASSEMBLY, -2).position;
  assert.deepEqual(under.toArray(), [6, 0, 0]);
});

test("0 to 100 to 0 to 50 to 100 leaves no drift", () => {
  const component = at(1, new Vector3(6, 0, 0), new Vector3(6, 0, 0));
  const reference = calculateExplosionTransform(component, ASSEMBLY, 1).position;

  for (const amount of [0, 1, 0, 0.5, 1]) {
    const { position } = calculateExplosionTransform(component, ASSEMBLY, amount);
    if (amount === 0) assert.deepEqual(position.toArray(), [6, 0, 0]);
    if (amount === 1) assert.deepEqual(position.toArray(), reference.toArray());
  }
});

test("the transform never mutates the rest position", () => {
  const component = at(1, new Vector3(6, 0, 0), new Vector3(6, 0, 0));
  calculateExplosionTransform(component, ASSEMBLY, 1);
  assert.deepEqual(component.rest.position.toArray(), [6, 0, 0]);
});

test("a real assembly separates every component at full explosion", () => {
  const components: ViewerComponent[] = discoverComponents(assemblyFixture());
  const bounds = measureAssembly(components);

  const exploded = components.map(
    (component) => calculateExplosionTransform(component, bounds, 1).position,
  );

  for (let a = 0; a < exploded.length; a += 1) {
    for (let b = a + 1; b < exploded.length; b += 1) {
      const first = exploded[a];
      const second = exploded[b];
      assert.ok(first && second);
      assert.ok(
        first.distanceTo(second) > 0.5,
        `components ${a} and ${b} landed on top of each other`,
      );
    }
  }
});

/* ------------------------------------------------------------------ *
 * Easing
 * ------------------------------------------------------------------ */

test("easing is bounded, monotonic and free of overshoot", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);

  let previous = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const value = easeInOutCubic(t);
    assert.ok(value >= 0 && value <= 1, `overshot at ${t}: ${value}`);
    assert.ok(value >= previous, `not monotonic at ${t}`);
    previous = value;
  }
});
