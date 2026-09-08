import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCEPTED_MODEL_EXTENSIONS,
  calculateQuote,
  roundRupees,
  validateQuoteRequest,
} from "./calculateQuote";
import { PRICING_RULES, type PricingRules } from "./rules";
import type { ManufacturingQuote, QuoteRequest, QuoteResponse } from "./types";

const MODEL = { name: "cube.stl", extension: ".stl", sizeBytes: 684, triangles: 12 };

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return { model: MODEL, material: "pla", quantity: 1, ...overrides };
}

/** Asserts the response priced successfully and returns the quote. */
function quoteOf(response: QuoteResponse): ManufacturingQuote {
  assert.equal(response.status, "available", `expected a quote, got ${response.status}`);
  assert.ok(response.status === "available");
  return response.quote;
}

function line(quote: ManufacturingQuote, id: string) {
  return quote.lines.find((entry) => entry.id === id);
}

/* ------------------------------------------------------------------ *
 * Structure
 * ------------------------------------------------------------------ */

test("prices a minimal valid configuration", () => {
  const quote = quoteOf(calculateQuote(request()));

  assert.equal(quote.currency, "INR");
  assert.equal(quote.quantity, 1);
  assert.equal(quote.basis, "configuration");
  assert.equal(quote.provisional, true);
  assert.equal(quote.rulesVersion, PRICING_RULES.version);
});

test("the breakdown always sums to the total", () => {
  const cases: QuoteRequest[] = [
    request(),
    request({ material: "resin", quality: "high-detail", finish: "smooth", quantity: 7 }),
    request({ material: "tpu", quality: "precision", finish: "matte", quantity: 3 }),
    request({ material: "pla", quantity: 500 }),
  ];

  for (const input of cases) {
    const quote = quoteOf(calculateQuote(input));
    const sum = quote.lines.reduce((total, entry) => total + entry.amount, 0);
    assert.equal(sum, quote.total, `lines did not sum to total for ${JSON.stringify(input)}`);
  }
});

test("every line is a whole number of rupees", () => {
  const quote = quoteOf(
    calculateQuote(request({ material: "petg", quality: "precision", quantity: 3 })),
  );

  for (const entry of quote.lines) {
    assert.ok(Number.isInteger(entry.amount), `${entry.id} was not an integer`);
  }
  assert.ok(Number.isInteger(quote.total));
});

test("a total is never negative", () => {
  for (const material of Object.keys(PRICING_RULES.materialFactor)) {
    for (const quantity of [1, 2, 50, 500]) {
      const quote = quoteOf(calculateQuote(request({ material, quantity })));
      assert.ok(quote.total >= 0, `${material} × ${quantity} produced a negative total`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Determinism
 * ------------------------------------------------------------------ */

test("the same request produces the same result every time", () => {
  const input = request({
    material: "abs",
    quality: "precision",
    finish: "smooth",
    quantity: 4,
  });

  const first = JSON.stringify(calculateQuote(input));
  const second = JSON.stringify(calculateQuote(input));
  const third = JSON.stringify(calculateQuote(input));

  assert.equal(first, second);
  assert.equal(second, third);
});

/* ------------------------------------------------------------------ *
 * Configuration effects
 * ------------------------------------------------------------------ */

test("material changes the total, and the reference material adds no line", () => {
  const pla = quoteOf(calculateQuote(request({ material: "pla", quantity: 5 })));
  const resin = quoteOf(calculateQuote(request({ material: "resin", quantity: 5 })));

  // PLA is the 1.0 reference, so there is no material adjustment to show.
  assert.equal(line(pla, "material"), undefined);
  assert.ok(line(resin, "material"));
  assert.ok(resin.total > pla.total);
});

test("quality changes the total, and standard adds no line", () => {
  const standard = quoteOf(calculateQuote(request({ quality: "standard", quantity: 5 })));
  const detailed = quoteOf(calculateQuote(request({ quality: "high-detail", quantity: 5 })));

  assert.equal(line(standard, "quality"), undefined);
  assert.ok(line(detailed, "quality"));
  assert.ok(detailed.total > standard.total);
});

test("finish changes the total, and a zero-fee finish adds no line", () => {
  const plain = quoteOf(calculateQuote(request({ finish: "standard", quantity: 5 })));
  const smooth = quoteOf(calculateQuote(request({ finish: "smooth", quantity: 5 })));

  assert.equal(line(plain, "finish"), undefined);
  assert.equal(line(smooth, "finish")?.amount, PRICING_RULES.finishFee.smooth! * 5);
  assert.ok(smooth.total > plain.total);
});

test("more units never cost less", () => {
  let previous = 0;
  for (const quantity of [1, 2, 3, 10, 25, 100, 500]) {
    const quote = quoteOf(calculateQuote(request({ material: "petg", quantity })));
    assert.ok(
      quote.total >= previous,
      `quantity ${quantity} cost less than the quantity below it`,
    );
    previous = quote.total;
  }
});

test("setup is charged once, not per unit", () => {
  const one = quoteOf(calculateQuote(request({ quantity: 1 })));
  const ten = quoteOf(calculateQuote(request({ quantity: 10 })));

  assert.equal(line(one, "setup")?.amount, PRICING_RULES.setupFee);
  assert.equal(line(ten, "setup")?.amount, PRICING_RULES.setupFee);
});

/* ------------------------------------------------------------------ *
 * Minimum order
 * ------------------------------------------------------------------ */

test("a small job is lifted to the minimum by an explicit line", () => {
  // Rules whose natural total falls below the floor.
  const cheap: PricingRules = {
    ...PRICING_RULES,
    setupFee: 20,
    baseUnitCost: 30,
    minimumOrder: 500,
  };

  const quote = quoteOf(calculateQuote(request(), cheap));
  const adjustment = line(quote, "minimum");

  assert.ok(adjustment, "expected a minimum order adjustment line");
  assert.equal(quote.total, cheap.minimumOrder);
  assert.equal(
    quote.lines.reduce((sum, entry) => sum + entry.amount, 0),
    quote.total,
  );
});

test("a job above the minimum carries no adjustment line", () => {
  const quote = quoteOf(calculateQuote(request({ material: "resin", quantity: 10 })));
  assert.equal(line(quote, "minimum"), undefined);
});

/* ------------------------------------------------------------------ *
 * Rounding
 * ------------------------------------------------------------------ */

test("rounding is half away from zero at the rupee", () => {
  assert.equal(roundRupees(100.49), 100);
  assert.equal(roundRupees(100.5), 101);
  assert.equal(roundRupees(100.51), 101);
  assert.equal(roundRupees(0), 0);
});

test("fractional rules still yield integer lines that sum to the total", () => {
  const awkward: PricingRules = {
    ...PRICING_RULES,
    setupFee: 249.5,
    baseUnitCost: 133.337,
    materialFactor: { ...PRICING_RULES.materialFactor, pla: 1.077 },
    minimumOrder: 0,
  };

  const quote = quoteOf(calculateQuote(request({ quantity: 3 }), awkward));

  for (const entry of quote.lines) assert.ok(Number.isInteger(entry.amount));
  assert.equal(
    quote.lines.reduce((sum, entry) => sum + entry.amount, 0),
    quote.total,
  );
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

test("a missing model is rejected", () => {
  const response = calculateQuote({
    model: { name: "", extension: "", sizeBytes: 0 },
    material: "pla",
    quantity: 1,
  });

  assert.equal(response.status, "invalid");
  assert.ok(response.status === "invalid");
  assert.ok(response.errors.some((error) => error.field === "model"));
});

test("an unsupported material is rejected", () => {
  const response = calculateQuote(request({ material: "titanium" }));
  assert.equal(response.status, "invalid");
  assert.ok(response.status === "invalid");
  assert.ok(response.errors.some((error) => error.field === "material"));
});

test("an unsupported quality or finish is rejected", () => {
  for (const input of [request({ quality: "ultra" }), request({ finish: "chrome" })]) {
    const response = calculateQuote(input);
    assert.equal(response.status, "invalid");
  }
});

test("invalid quantities are rejected", () => {
  for (const quantity of [0, -1, 1.5, Number.NaN, PRICING_RULES.maxQuantity + 1]) {
    const response = calculateQuote(request({ quantity }));
    assert.equal(response.status, "invalid", `quantity ${quantity} was accepted`);
    assert.ok(response.status === "invalid");
    assert.ok(response.errors.some((error) => error.field === "quantity"));
  }
});

test("an unsupported file extension is rejected", () => {
  const response = calculateQuote(
    request({ model: { ...MODEL, name: "notes.txt", extension: ".txt" } }),
  );
  assert.equal(response.status, "invalid");
});

test("every accepted extension can be quoted", () => {
  for (const extension of ACCEPTED_MODEL_EXTENSIONS) {
    const response = calculateQuote(
      request({ model: { ...MODEL, extension, name: `part${extension}` } }),
    );
    assert.equal(response.status, "available", `${extension} was rejected`);
  }
});

test("validation reports every problem at once", () => {
  const errors = validateQuoteRequest({
    model: { name: "x.txt", extension: ".txt", sizeBytes: 0 },
    material: "unobtanium",
    quantity: 0,
  });

  const fields = new Set(errors.map((error) => error.field));
  assert.ok(fields.has("model"));
  assert.ok(fields.has("material"));
  assert.ok(fields.has("quantity"));
});

/* ------------------------------------------------------------------ *
 * Honesty guarantees
 * ------------------------------------------------------------------ */

test("a quote without geometry is never presented as geometry-based", () => {
  const quote = quoteOf(calculateQuote(request()));
  assert.equal(quote.basis, "configuration");
  assert.ok(quote.excluded.some((item) => /geometry/i.test(item)));
});

test("geometry-dependent cost, shipping and tax are all declared as excluded", () => {
  const quote = quoteOf(calculateQuote(request()));
  assert.ok(quote.excluded.some((item) => /shipping/i.test(item)));
  assert.ok(quote.excluded.some((item) => /tax/i.test(item)));
});

test("no line claims a measured quantity the system cannot compute", () => {
  const quote = quoteOf(
    calculateQuote(request({ material: "resin", quality: "high-detail", quantity: 2 })),
  );

  // Volume, weight and print time are not measured, so they must never appear.
  const forbidden = /cm³|gram|\bg\b|print time|volume|weight/i;
  for (const entry of quote.lines) {
    assert.ok(!forbidden.test(entry.label), `line "${entry.label}" implies measured geometry`);
    assert.ok(
      !entry.detail || !forbidden.test(entry.detail),
      `detail "${entry.detail}" implies measured geometry`,
    );
  }
});
