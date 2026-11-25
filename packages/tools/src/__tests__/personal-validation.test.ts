import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApprovalPolicy, type HumanApprovalPort } from "@ai-harness/contracts";
import { HumanApprovalAuthority } from "@ai-harness/security";
import { ValidationCoordinator } from "../validation-coordinator.js";
import { validationFixture, operator } from "./phase9-validation-fixture.js";
const personal = { ...normalizeApprovalPolicy(), mode: "personal" as const, allowRequesterApproval: true };
const human = new HumanApprovalAuthority({ method: "reviewed-external-v1", verify: async () => true });
test("Personal sandbox needs a different approval, scope, challenge and human intent from its patch", async t => {
  const f = await validationFixture(t, "completed", personal); let calls = 0;
  const coordinator = new ValidationCoordinator({ store: f.store, evidence: f.evidence, registry: f.registry, approvalPolicy: personal,
    authorize: async () => operator, approvalVerifier: () => ({ verify: async () => ({ ...operator, roles: ["harness:approver"] }) }),
    runtime: { execute: async () => { calls++; return { classification: "passed", exitCode: 0, timedOut: false, cancelled: false, cleanup: "confirmed", output: "fixed", diagnostics: ["action.passed"] }; } } });
  const patchGrant = f.store.approval(f.store.get(f.artifact.operationId)!.approvalId!)!;
  const pending = await coordinator.prepare(f.artifact, f.workspace, "test"); assert.equal(pending.status, "approval_required");
  const patchContext = f.store.approvalReview!(f.artifact.operationId)!, sandboxContext = f.store.approvalReview!(pending.operationId!)!;
  assert.notEqual(patchContext.challenge, sandboxContext.challenge); assert.notEqual(patchContext.scopeDigest, sandboxContext.scopeDigest); assert.notEqual(patchGrant.approvalId, pending.approvalId);
  assert.notEqual((await coordinator.execute(f.artifact, f.workspace, "test", patchGrant.approvalId)).status, "executed"); assert.equal(calls, 0);
  await assert.rejects(coordinator.approve(f.artifact, f.workspace, "test", "opaque-fixture-handle"));
  const replay: HumanApprovalPort = { confirm: async () => patchGrant.decision!.intent! };
  await assert.rejects(coordinator.approve(f.artifact, f.workspace, "test", "opaque-fixture-handle", replay)); assert.equal(calls, 0);
  await coordinator.approve(f.artifact, f.workspace, "test", "opaque-fixture-handle", human);
  assert.equal(calls, 0); const grant = f.store.approval(pending.approvalId!)!; assert.equal(grant.decision!.mode, "personal"); assert.notEqual(grant.decision!.intent!.id, patchGrant.decision!.intent!.id);
  const executed = await coordinator.execute(f.artifact, f.workspace, "test", pending.approvalId!); assert.equal(executed.status, "executed"); assert.equal(calls, 1);
  assert.notEqual((await coordinator.execute(f.artifact, f.workspace, "test", pending.approvalId!)).status, "executed"); assert.equal(calls, 1);
});
test("sandbox approver role and cancellation are enforced without starting a runtime", async t => {
  const f = await validationFixture(t, "completed", personal);
  const base = { store: f.store, evidence: f.evidence, registry: f.registry, approvalPolicy: personal, authorize: async () => operator,
    runtime: { execute: async (): Promise<never> => { throw new Error("Runtime must not start"); } } };
  await assert.rejects(new ValidationCoordinator({ ...base, approvalVerifier: () => ({ verify: async () => ({ ...operator, roles: ["harness:operator"] }) }) }).approve(f.artifact, f.workspace, "test", "fixture", human));
  const coordinator = new ValidationCoordinator({ ...base, approvalVerifier: () => ({ verify: async () => ({ ...operator, roles: ["harness:approver"] }) }) });
  await assert.rejects(coordinator.approve(f.artifact, f.workspace, "test", "fixture", { confirm: async () => null }));
  assert.equal(f.store.list(f.artifact.executionId).find(o => o.toolId === "sandbox.validate")!.state, "PendingApproval");
});
