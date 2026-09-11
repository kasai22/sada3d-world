import assert from "node:assert/strict";
import test from "node:test";

import { hasMalformedEncoding } from "./url";

test("a path whose percent-escapes do not decode is malformed", () => {
  for (const path of ["/api/orders/%E0%A4%A", "/shop/%zz", "/api/orders/%", "/a/%E0%A4"]) {
    assert.equal(hasMalformedEncoding(path), true, path);
  }
});

test("plain and well-formed paths are not refused here", () => {
  for (const path of ["/", "/shop/prototyping/tolerance-test-block", "/shop/a%20b", "/api/orders/S3D-000184", "/x/%2F%2E"]) {
    assert.equal(hasMalformedEncoding(path), false, path);
  }
});
