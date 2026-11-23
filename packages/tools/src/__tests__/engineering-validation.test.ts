import assert from "node:assert/strict";
import test from "node:test";
import { EngineeringValidationRegistry, PodmanEngineeringValidator } from "../engineering-validation.js";
const command = { id: "types", intent: "type_check" as const, image: "example.invalid/fixture@sha256:" + "1".repeat(64), argv: ["node", "--version"], timeoutMs: 1000, maxLogBytes: 4096, resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } };
test("validation commands are host descriptions only and cannot be overwritten", () => {
  const registry = new EngineeringValidationRegistry(); registry.register(command);
  const copy = registry.get("types"); (copy.argv as string[])[0] = "sh";
  assert.equal(registry.get("types").argv[0], "node"); assert.throws(() => registry.register(command)); assert.throws(() => registry.get("model-command"));
});
for (const invalid of [{ ...command, argv: ["sh", "-c", "untrusted"] }, { ...command, image: "latest" }, { ...command, resources: { ...command.resources, memoryBytes: 536870912 } }, { ...command, resources: { ...command.resources, cpu: 2 } }, { ...command, resources: { ...command.resources, pids: 128 } }, { ...command, timeoutMs: Infinity }]) test("validation registry rejects weaker or unbounded execution descriptions", () => assert.throws(() => new EngineeringValidationRegistry().register(invalid)));
test("real Podman engineering remains blocked even with a valid command description", async () => {
  const validator = new PodmanEngineeringValidator(); assert.equal(validator.available, false);
  await assert.rejects(validator.validate({ digest: "1".repeat(64), files: [] }, "fixture", command), /L3 blocked/);
});
