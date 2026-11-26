import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { canonicalProposalJson, type EngineeringPolicy } from "@ai-harness/contracts";
import { directories, generate, policy } from "./resume-fixture.js";
import { openRepairFixture } from "./repair-fixture.js";

test("repair preserves legacy policy encoding when host policy and reopened artifact have reordered keys", async t => {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-repair-encoding-")));
  await chmod(base, 0o700); await directories(base);
  await writeFile(path.join(base, "source", "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  t.after(() => rm(base, { recursive: true, force: true }));
  const generated = await generate(base), f = await openRepairFixture(base);
  t.after(() => { try { f.store.close(); } catch { /* Test cleanup only. */ } });
  f.binding.id = generated.result.executionId;
  const initial = f.artifact();
  assert.notEqual(JSON.stringify(initial.policy), initial.policyEncoding, "Canonical artifact order differs from the historical engine encoding");
  await f.approvePatch(initial); await f.apply(initial); await f.validate(initial);
  const evidence = await f.port.latest(initial); assert.ok(evidence);
  const reordered = JSON.parse(canonicalProposalJson(policy)) as EngineeringPolicy;
  assert.notEqual(JSON.stringify(reordered), initial.policyEncoding);
  const coordinator = f.coordinator({ policy: reordered });
  const session = await coordinator.start({ operationId: initial.operationId, validationId: evidence.validationId,
    objective: "Correct the synthetic value while preserving exact host policy", profileId: f.port.profileId, profileDigest: f.port.profileDigest, actionId: f.port.actionId });
  const proposed = await coordinator.advance(session.sessionId); assert.equal(proposed.state, "AwaitingPatchApproval");
  const repair = f.artifact();
  assert.equal(repair.policyEncoding, initial.policyEncoding); assert.equal(repair.policyDigest, initial.policyDigest); assert.equal(repair.patch.policyDigest, initial.policyDigest);
  await f.approvePatch(repair); await f.apply(repair); await coordinator.advance(session.sessionId); await f.validate(repair);
  const result = await coordinator.advance(session.sessionId); assert.equal(result.state, "Completed");
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
});
