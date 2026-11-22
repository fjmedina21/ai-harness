import assert from "node:assert/strict";
import test from "node:test";
import { digestDurableValue } from "../durable-approval.js";

test("canonical digests are stable across object key order and bind all JSON values", () => {
  assert.equal(digestDurableValue({ b: [1, true, null], a: "text" }), digestDurableValue({ a: "text", b: [1, true, null] }));
  assert.notEqual(digestDurableValue({ a: 1 }), digestDurableValue({ a: "1" }));
  assert.notEqual(digestDurableValue([1, 2]), digestDurableValue([2, 1]));
});
test("canonical digests reject non-JSON, dangerous keys and excessive depth/size", () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, BigInt(1), new Date(), cycle,
    { value: "x".repeat(16_385) }, JSON.parse('{"__proto__":{}}'),
    new Array(4097).fill(1), new Array(1), new Array(1_000_000),
  ]) assert.throws(() => digestDurableValue(value));
});
