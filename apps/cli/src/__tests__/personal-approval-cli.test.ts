import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { normalizeApprovalPolicy, type HumanApprovalReview } from "@ai-harness/contracts";
import { HumanApprovalAuthority, assertHumanIntent } from "@ai-harness/security";
import { createInteractiveApprovalPort, MACOS_HUMAN_AUTHENTICATION, exactReviewDisplay } from "../human-approval.js";
import { main } from "../index.js";
const personal = { ...normalizeApprovalPolicy(), mode: "personal" as const, allowRequesterApproval: true };
const review: HumanApprovalReview = { actor: { issuer: "github.com", subject: "101" }, diff: "-old\n+new\n", files: [{ path: "value.ts", operation: "replace" }], workspace: "isolated", risk: "code modification",
  context: { schemaVersion: 1, operationId: "a".repeat(64), executionId: "fixture", scopeDigest: "b".repeat(64), purpose: "patch.apply", policy: personal, policyDigest: "c".repeat(64), challenge: "d".repeat(64), expiresAt: new Date(Date.now() + 60000).toISOString(), workspaceId: "workspace", artifactDigest: "e".repeat(64), patchDigest: "f".repeat(64), snapshotDigest: "1".repeat(64), contentDigest: "2".repeat(64) } };
test("Personal CLI rejects non-interactive input before any OS dialog or approval", async () => {
  assert.equal(!!process.stdin.isTTY, false); await assert.rejects(createInteractiveApprovalPort().confirm(review));
});
test("Personal CLI rejects hidden review output even with input and stdout TTYs", async () => {
  const descriptors = [process.stdin, process.stdout, process.stderr].map(stream => Object.getOwnPropertyDescriptor(stream, "isTTY"));
  try {
    for (const [index, stream] of [process.stdin, process.stdout, process.stderr].entries()) Object.defineProperty(stream, "isTTY", { value: index !== 2, configurable: true });
    await assert.rejects(createInteractiveApprovalPort().confirm(review));
  } finally {
    for (const [index, stream] of [process.stdin, process.stdout, process.stderr].entries()) {
      const original = descriptors[index]; if (original) Object.defineProperty(stream, "isTTY", original); else Reflect.deleteProperty(stream, "isTTY");
    }
  }
});
test("native presence bridge source parses without invoking LocalAuthentication", () => { assert.doesNotThrow(() => new Script(MACOS_HUMAN_AUTHENTICATION)); });
test("exact review preserves escaped controls and bidi instead of silently deleting source", () => {
  const source = "+x\u001b[31m\u202e\\u001b\t\n", text = exactReviewDisplay(source); assert.doesNotMatch(text, /[\u001b\u202e]/); assert.equal(text.split("\n").map(line => JSON.parse(line)).join("\n"), source);
});
test("JSON/model claims and serialized genuine receipts cannot become human intent", async () => {
  const genuine = await new HumanApprovalAuthority({ method: "reviewed-external-v1", verify: async () => true }).confirm(review);
  assert.ok(genuine); assertHumanIntent(genuine, review.context, review.actor);
  assert.throws(() => assertHumanIntent(JSON.parse(JSON.stringify(genuine)), review.context, review.actor)); assert.throws(() => assertHumanIntent({ ...genuine }, review.context, review.actor));
});
for (const flag of ["--yes", "--force-approve", "--skip-review", "--approval-mode"]) test("CLI rejects approval bypass " + flag, async () => {
  const output: string[] = []; assert.equal(await main(["engineering", "approve", "--id", "fixture", flag], process.cwd(), s => output.push(s)), 1); assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments");
});
test("Team policy remains default and Personal policy is explicit and strictly validated", () => {
  assert.equal(normalizeApprovalPolicy().mode, "team"); assert.equal(normalizeApprovalPolicy().allowRequesterApproval, false); assert.deepEqual(normalizeApprovalPolicy(personal), personal);
  for (const candidate of [null, {}, { ...personal, version: 2 }, { ...personal, mode: "agent" }, { ...personal, mode: "team" }, { ...personal, allowRequesterApproval: false }, { ...personal, requireHumanConfirmation: false }, { ...personal, requireExactPatchReview: false }, { ...personal, requireSeparateSandboxApproval: false }, { ...personal, autoApprove: true }]) assert.throws(() => normalizeApprovalPolicy(candidate));
});
