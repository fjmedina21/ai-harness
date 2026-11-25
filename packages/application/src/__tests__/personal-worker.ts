import path from "node:path";
import { openSqliteOperationJournal, ProposalArtifactStore } from "@ai-harness/checkpointing";
import { ContinuationCoordinator } from "../engineering-resume.js";
import { generate, policy } from "./resume-fixture.js";
import { personal, owner, confirmation, authentication } from "./personal-fixture.js";
const [base, mode, operationId] = process.argv.slice(2);
if (!base || !mode) throw new Error("Missing synthetic worker scope");
// No ambient HTTP/provider fallback is possible during continuation.
let providerCalls = 0; globalThis.fetch = async () => { providerCalls++; throw new Error("Provider call forbidden during continuation"); };
const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"), { approvalPolicy: personal, approvalTtlMs: 300000 });
try {
  if (mode === "generate") {
    const generated = await generate(base, store, false, { approvalPolicy: personal, requester: owner });
    process.send?.({ ok: true, ...generated, pid: process.pid });
  } else {
    const artifacts = new ProposalArtifactStore(path.join(base, "state"), false), ref = store.proposal(operationId!)!;
    const identity = authentication(path.join(base, "source"), path.join(base, "workspaces"));
    const bound = identity.auth.resumeVerifier({ sourceRoot: path.join(base, "source"), workspaceDirectory: path.join(base, "workspaces"), executionId: ref.executionId, workspaceId: ref.workspaceId });
    const coordinator = new ContinuationCoordinator({ store, artifacts, policy, approvalPolicy: personal, verifier: bound.verifier });
    if (mode === "review") await coordinator.decide(operationId!, bound.credential, true, { confirm: async () => {
      process.send?.({ reviewing: true });
      return new Promise(() => { setInterval(() => {}, 1000); });
    } });
    else if (mode === "approve") await coordinator.decide(operationId!, bound.credential, true, confirmation);
    else await coordinator.continue(operationId!, bound.credential, 5000);
    process.send?.({ ok: true, pid: process.pid, state: store.get(operationId!)!.state, providerCalls, githubCalls: identity.calls() });
  }
} catch { process.send?.({ ok: false, providerCalls }); }
finally { store.close(); process.disconnect?.(); }
