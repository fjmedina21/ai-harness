import assert from "node:assert/strict";
import test from "node:test";

import { BUILTIN_TOOLS, ToolRegistry } from "../index.js";

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  for (const definition of BUILTIN_TOOLS) {
    registry.register(definition);
  }

  return registry;
}

test("registers and discovers built-in tools", () => {
  const registry = createRegistry();

  assert.equal(registry.list().length, 4);
  assert.equal(registry.get("file.read")?.permission, "files:read");
  assert.equal(registry.get("shell.execute")?.risk, "high");
});

test("rejects duplicate tool registrations", () => {
  const registry = createRegistry();

  assert.throws(
    () => registry.register(BUILTIN_TOOLS[0]!),
    /already registered/,
  );
});

test("validates required fields and argument types", () => {
  const registry = createRegistry();

  assert.equal(
    registry.validate({
      toolId: "file.read",
      arguments: { path: "src/index.ts" },
    }).valid,
    true,
  );

  assert.equal(
    registry.validate({
      toolId: "file.read",
      arguments: {},
    }).valid,
    false,
  );

  assert.equal(
    registry.validate({
      toolId: "file.read",
      arguments: { path: 123 },
    }).valid,
    false,
  );
});

test("rejects unknown tools and unexpected fields", () => {
  const registry = createRegistry();

  assert.equal(
    registry.validate({
      toolId: "unknown.tool",
      arguments: {},
    }).valid,
    false,
  );

  assert.equal(
    registry.validate({
      toolId: "file.read",
      arguments: {
        path: "README.md",
        admin: true,
      },
    }).valid,
    false,
  );
});

test("rejects invalid schemas", () => {
  const registry = new ToolRegistry();

  assert.throws(
    () =>
      registry.register({
        ...BUILTIN_TOOLS[0]!,
        id: "invalid.schema",
        inputSchema: {
          type: "object",
          properties: {},
          required: ["missing"],
          additionalProperties: false,
        },
      }),
    /Required field is not declared/,
  );
});

test("registry definitions cannot be mutated externally", () => {
  const registry = createRegistry();

  const definition = registry.get("file.read")!;
  definition.description = "Modified externally";

  assert.notEqual(
    registry.get("file.read")?.description,
    "Modified externally",
  );
});
