import assert from "node:assert/strict";
import test from "node:test";

import { parseModelToolTurn, TOOL_CALL_LIMITS } from "../index.js";

function validTurn() {
  return {
    kind: "tool_calls",
    calls: [
      {
        id: "call_001",
        toolId: "file.read",
        arguments: {
          path: "src/index.ts",
        },
      },
    ],
  };
}

test("accepts a normal text response", () => {
  const turn = parseModelToolTurn({
    kind: "message",
    text: "Task completed",
  });

  assert.equal(turn.kind, "message");

  if (turn.kind === "message") {
    assert.equal(turn.text, "Task completed");
  }
});

test("normalizes a valid tool call", () => {
  const turn = parseModelToolTurn(validTurn());

  assert.equal(turn.kind, "tool_calls");

  if (turn.kind === "tool_calls") {
    assert.equal(turn.calls[0]?.toolId, "file.read");
    assert.deepEqual(turn.calls[0]?.arguments, { path: "src/index.ts" });
  }
});

test("rejects duplicate call identifiers", () => {
  const call = validTurn().calls[0]!;

  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [call, { ...call }],
      }),
    /Duplicate tool call IDs/,
  );
});

test("rejects too many tool calls", () => {
  const calls = Array.from(
    { length: TOOL_CALL_LIMITS.maxCallsPerTurn + 1 },
    (_, index) => ({
      id: `call_${index}`,
      toolId: "file.read",
      arguments: { path: "README.md" },
    }),
  );

  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls,
      }),
    /Invalid tool call count/,
  );
});

test("rejects unexpected fields", () => {
  assert.throws(
    () =>
      parseModelToolTurn({
        ...validTurn(),
        grantedPermissions: ["shell:execute"],
      }),
    /Unexpected model turn property/,
  );

  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [
          {
            ...validTurn().calls[0],
            risk: "low",
          },
        ],
      }),
    /Unexpected tool call property/,
  );
});

test("rejects prototype pollution properties", () => {
  const argumentsObject = JSON.parse('{"__proto__":{"admin":true}}') as Record<
    string,
    unknown
  >;

  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [
          {
            id: "call_safe",
            toolId: "file.read",
            arguments: argumentsObject,
          },
        ],
      }),
    /Forbidden tool argument property/,
  );
});

test("rejects excessive argument size", () => {
  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [
          {
            id: "call_large",
            toolId: "file.read",
            arguments: {
              path: "x".repeat(TOOL_CALL_LIMITS.maxArgumentsBytes),
            },
          },
        ],
      }),
    /size limit/,
  );
});

test("rejects invalid argument types", () => {
  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [
          {
            id: "call_bad",
            toolId: "file.read",
            arguments: {
              path: undefined,
            },
          },
        ],
      }),
    /Unsupported tool argument type/,
  );

  assert.throws(
    () =>
      parseModelToolTurn({
        kind: "tool_calls",
        calls: [
          {
            id: "call_bad_number",
            toolId: "file.read",
            arguments: {
              count: Number.POSITIVE_INFINITY,
            },
          },
        ],
      }),
    /Non-finite tool argument/,
  );
});

test("does not retain mutable provider arguments", () => {
  const raw = validTurn();
  const turn = parseModelToolTurn(raw);

  raw.calls[0]!.arguments.path = "modified.ts";

  assert.equal(turn.kind, "tool_calls");

  if (turn.kind === "tool_calls") {
    assert.equal(turn.calls[0]?.arguments.path, "src/index.ts");
  }
});
