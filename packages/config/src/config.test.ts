import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultConfig, validateConfig } from "./index.js";

test("default configuration passes validation", () => {
  const config = createDefaultConfig("demo");
  assert.equal(validateConfig(config).valid, true);
  assert.equal(config.security.defaultDeny, true);
  assert.equal(config.agents.enabled.length, 15);
});
test("config rejects unknown roles and weak security defaults", () => {
  const config = createDefaultConfig("demo");
  assert.equal(
    validateConfig({
      ...config,
      security: { ...config.security, defaultDeny: false },
    }).valid,
    false,
  );
  assert.equal(
    validateConfig({ ...config, agents: { enabled: ["super-admin"] } }).valid,
    false,
  );
});
test("config rejects unexpected storage backends in phase 0", () => {
  const config = createDefaultConfig("demo");
  assert.equal(
    validateConfig({ ...config, storage: { mode: "postgres" } }).valid,
    false,
  );
});
