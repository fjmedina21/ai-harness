import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { NodeProcessRunner, ProcessExecutionError } from "../process-runner.js";
const runner = new NodeProcessRunner();
const run = (code: string, timeout = 1000, signal?: AbortSignal) => runner.run(process.execPath, ["-e", code], timeout, { signal });
const kind = (name: string) => (error: unknown) => error instanceof ProcessExecutionError && error.kind === name && !error.message.includes("secret");

test("process runner preserves nonzero exit without exposing runtime errors", async () => {
  const result = await run('process.stdout.write("fixture"); process.exitCode=7');
  assert.equal(result.exitCode, 7); assert.equal(result.stdout, "fixture");
});
test("process runner sanitizes spawn failures", async () => {
  await assert.rejects(runner.run("/nonexistent/secret-program", [], 1000), kind("start_failed"));
  await assert.rejects(runner.run("node", [], 1000), kind("start_failed"));
});
test("pre-cancelled process cannot start", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(run('throw Error("secret")', 1000, controller.signal), kind("cancelled"));
});
test("process runner bounds combined stdout and stderr", async () => {
  await assert.rejects(run('process.stdout.write("x".repeat(3000)); process.stderr.write("x".repeat(3000))'), kind("output_limit"));
});
test("timeout terminates a real fixed fixture process", async () => {
  await assert.rejects(run('setInterval(()=>{},1000)', 50), kind("timeout"));
});
test("abort terminates a real fixture process", async () => {
  const controller = new AbortController();
  const active = run('setInterval(()=>{},1000)', 1000, controller.signal);
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(active, kind("cancelled"));
});
test("invalid deadlines cannot create a process", async () => {
  for (const timeout of [0, -1, 1.5, 10001, Infinity]) await assert.rejects(run("", timeout), kind("start_failed"));
});

test("cancellation terminates a fixture process group including its child", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness-process-group-"));
  const pidFile = path.join(root, "child.pid");
  const controller = new AbortController();
  let pid: number | undefined;
  const code = `const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`;
  const active = assert.rejects(run(code, 3000, controller.signal), kind("cancelled"));
  try {
    for (let i = 0; i < 100; i++) {
      try { pid = Number(await readFile(pidFile, "utf8")); break; } catch { await delay(10); }
    }
    assert.ok(pid && Number.isSafeInteger(pid));
    controller.abort(); await active;
    let alive = true;
    for (let i = 0; i < 50; i++) {
      try {
        process.kill(pid, 0);
        if (process.platform === "linux") {
          const stat = await readFile(`/proc/${pid}/stat`, "utf8");
          if (/\) Z /.test(stat)) { alive = false; break; }
        }
      } catch { alive = false; break; }
      await delay(10);
    }
    assert.equal(alive, false);
  } finally {
    controller.abort(); await active;
    if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
    await rm(root, { recursive: true, force: true });
  }
});


test("process runner preserves host temp identity without forwarding ambient configuration", async () => {
  const previous = process.env.HARNESS_TEST_AMBIENT_SECRET;
  process.env.HARNESS_TEST_AMBIENT_SECRET = "fixture-only";
  try {
    const result = await run('process.stdout.write(JSON.stringify({ temp:require("node:os").tmpdir(), keys:Object.keys(process.env).sort() }))');
    const actual = JSON.parse(result.stdout);
    assert.equal(actual.temp, tmpdir());
    // macOS may inject its own CoreFoundation encoding marker after spawn.
    assert.deepEqual(actual.keys.filter((key: string) => process.platform !== "darwin" || key !== "__CF_USER_TEXT_ENCODING"), ["HOME", "PATH", "TMPDIR"]);
  } finally {
    if (previous === undefined) delete process.env.HARNESS_TEST_AMBIENT_SECRET;
    else process.env.HARNESS_TEST_AMBIENT_SECRET = previous;
  }
});
