import assert from "node:assert/strict";
import { ContainerExecutor } from "../container-executor.js";
import { ContainerExecutionError, executeFixedContainer } from "../container-runtime.js";
import { NodeProcessRunner } from "../process-runner.js";
import { loadIsolationProfile } from "../isolation-profile.js";
import { setTimeout as delay } from "node:timers/promises";
import { runtimePrefix } from "../runtime-backend.js";
import type { ProcessRunOptions } from "@ai-harness/contracts";

// Separate command, excluded from the normal deterministic test glob. Never silently skip.
let validated = false;
let stage = "profile";
try {
  const options = await loadIsolationProfile(process.env.HARNESS_ISOLATION_PROFILE);
  const runner = new NodeProcessRunner();
  stage = "preflight";
  const preflight = await new ContainerExecutor(options, runner).preflight();
  validated = true;
  stage = "version";
  const version = await new ContainerExecutor(options, runner).execute("node.version");
  assert.match(version.stdout, /^v\d+\.\d+\.\d+/);
  assert.equal(version.cleanup, "confirmed");
  stage = "inspection";
  const inspection = await executeFixedContainer(options, runner, "isolation.inspect");
  const evidence = JSON.parse(inspection.stdout);
  assert.deepEqual(evidence, { uid: 65534, capabilities: "none", seccomp: 2, noNewPrivileges: true, rootReadonly: true,
    tmpfsBytes: 16777216, network: "denied", memoryBytes: 268435456, swapBytes: 0, pids: 64, cpu: 0.5 });
  assert.equal(inspection.cleanup, "confirmed");
  const controller = new AbortController();
  stage = "cancellation";
  let observedRunning = false;
  class CancellingRunner extends NodeProcessRunner {
    override async run(executable: string, args: readonly string[], timeout: number, runOptions?: ProcessRunOptions) {
      const active = super.run(executable, args, timeout, runOptions);
      if (args.includes("start")) {
        // Observe the actual daemon state, not merely submission of start.
        // Poll only read-only metadata; never retry a side-effecting operation.
        void active.catch(() => {});
        const observation = AbortSignal.timeout(2000);
        try {
          for (let attempt = 0; attempt < 10; attempt++) {
            await delay(100, undefined, { signal: observation });
            const state = await super.run(executable, [...runtimePrefix(options, preflight), "container", "inspect", args.at(-1)!, "--format", "{{json .State.Running}}"], 1000, { signal: observation });
            if (state.exitCode === 0 && state.stdout.trim() === "true" && !state.stderr.trim()) {
              observedRunning = true; controller.abort(); break;
            }
          }
        } catch { /* Missing evidence makes acceptance fail, never succeed. */ }
      }
      return active;
    }
  }
  await assert.rejects(executeFixedContainer(options, new CancellingRunner(), "isolation.wait", controller.signal),
    (e: unknown) => e instanceof ContainerExecutionError && e.kind === "cancelled" && e.cleanup === "confirmed" && e.states.includes("running"));
  assert.equal(observedRunning, true);
  stage = "timeout";
  await assert.rejects(executeFixedContainer(options, runner, "isolation.wait"),
    (e: unknown) => e instanceof ContainerExecutionError && e.kind === "timeout" && e.cleanup === "confirmed" && e.states.includes("running"));
  console.log(JSON.stringify({ status: "passed", timestamp: new Date().toISOString(), node: process.version,
    backend: preflight.backend, preflight, containerNode: version.stdout.trim(), image: options.image, probes: evidence, cleanup: "confirmed", cancellation: "confirmed", cancellationRunning: observedRunning, timeout: "confirmed" }));
} catch {
  console.error(JSON.stringify({ stage, status: validated ? "failed" : "blocked", reason: validated
    ? "Real isolation probe or confirmed cleanup did not pass" : "Dedicated private runtime profile or required daemon capabilities unavailable" }));
  process.exitCode = validated ? 1 : 2;
}
