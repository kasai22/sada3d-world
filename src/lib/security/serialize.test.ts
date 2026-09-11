import assert from "node:assert/strict";
import test from "node:test";

import { serializeJsonForScript } from "./serialize";

/* ASCII only: the separators are built from their code points. */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

test("text that would close a script element stays inside the JSON", () => {
  const hostile = {
    name: '</script><script>alert("x")</script>',
    description: "<!-- <img src=x onerror=alert(1)> & more",
    separators: `line${LINE_SEPARATOR}paragraph${PARAGRAPH_SEPARATOR}end`,
  };

  const serialized = serializeJsonForScript(hostile);

  assert.doesNotMatch(serialized, /[<>&]/);
  assert.equal(serialized.includes(LINE_SEPARATOR), false);
  assert.equal(serialized.includes(PARAGRAPH_SEPARATOR), false);
  assert.doesNotMatch(serialized, /<\/script/i);
});

test("ordinary text, spaces included, is left exactly as it was", () => {
  const value = { name: "Precision Gear, 42 teeth" };
  assert.equal(serializeJsonForScript(value), JSON.stringify(value));
});

test("a JSON consumer reads exactly the original value", () => {
  const value = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Bracket <v2> & mount </script>",
    offers: { price: 646, priceCurrency: "INR" },
    note: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`,
  };

  assert.deepEqual(JSON.parse(serializeJsonForScript(value)), value);
});
