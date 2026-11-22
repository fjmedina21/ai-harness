import assert from "node:assert/strict";
import test from "node:test";
import { DefaultPolicyEngine } from "../index.js";

const policy = new DefaultPolicyEngine();

test("denies permissions not granted", () => {
  const result = policy.authorize("shell:execute", "low", ["files:read"]);

  assert.equal(result.allowed, false);
  assert.equal(result.approvalRequired, false);
});

test("allows low-risk reads", () => {
  const result = policy.authorize("files:read", "low", ["files:read"]);

  assert.equal(result.allowed, true);
  assert.equal(result.approvalRequired, false);
});

test("requires approval for privileged operations", () => {
  const result = policy.authorize("files:write", "medium", [
    "files:read",
    "files:write",
  ]);

  assert.equal(result.allowed, false);
  assert.equal(result.approvalRequired, true);
});

test("requires approval for high-risk reads", () => {
  const result = policy.authorize("files:read", "high", ["files:read"]);

  assert.equal(result.allowed, false);
  assert.equal(result.approvalRequired, true);
});
