import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const executable = fileURLToPath(new URL("../index.js", import.meta.url));
const preload = fileURLToPath(new URL("./openai-engineering-fetch.js", import.meta.url));
async function fixture(t: TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-openai-cli-"))), source = path.join(root, "source");
  await mkdir(source, { mode: 0o700 }); await writeFile(path.join(source, "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  await writeFile(path.join(source, ".env"), "OPENAI_API_KEY=PRIVATE_LOCAL_ENV\n", { mode: 0o600 });
  t.after(() => rm(root, { recursive: true, force: true }));
  const args = ["run", "--workflow", "implement", "--path", source, "--request", "Change value from one to two", "--provider", "openai", "--model", "fixture-model", "--autonomy", "propose", "--files", "value.ts",
    "--max-provider-requests", "6", "--max-output-tokens", "512", "--confirm-provider-call", "--allow-uncertain-cost"];
  const run = (options: { args?: string[]; scenario?: string; credential?: boolean; cancel?: boolean } = {}) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", preload, executable, ...(options.args ?? [...args, "--json"])], {
      cwd: source, env: { PATH: process.env.PATH, ...(options.credential === false ? {} : { OPENAI_API_KEY: "fixture-not-real" }), HARNESS_TEST_OPENAI_SCENARIO: options.scenario ?? "valid" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", cancelled = false;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Fixture CLI subprocess deadline")); }, 10000);
    child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length > 100000) child.kill("SIGKILL"); });
    child.stderr.on("data", chunk => { stderr += String(chunk); if (options.cancel && !cancelled && stderr.includes("MOCK_PROVIDER_READY")) { cancelled = true; child.kill("SIGINT"); } });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  return { root, source, args, run };
}
function remove(args: string[], key: string, value = true): string[] { const copy = [...args], i = copy.indexOf(key); if (i >= 0) copy.splice(i, value ? 2 : 1); return copy; }
function replace(args: string[], key: string, value: string): string[] { const copy = [...args]; copy[copy.indexOf(key) + 1] = value; return copy; }
test("actual CLI subprocess produces an OpenAI L1 proposal through mocked real Responses adapter", async t => {
  const f = await fixture(t), p = await f.run(); assert.equal(p.code, 0, p.stdout + p.stderr); const r = JSON.parse(p.stdout);
  assert.equal(r.provider, "openai"); assert.equal(r.model, "fixture-model"); assert.equal(r.termination, "proposed"); assert.equal(r.usage.requests, 4); assert.equal(r.proposalValidation, "passed");
  assert.match(r.diff, /value = 2/); assert.equal(r.proposals.length, 1); assert.equal(r.usage.estimatedCostUsd, null); assert.equal(r.reportedUsage.inputTokens, 400); assert.equal(r.integrated, false);
  assert.deepEqual(await readdir(f.source), [".env", "value.ts"]); assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("actual CLI accepts a host-selected 120 second engineering deadline", async t => {
  const f = await fixture(t), p = await f.run({ args: [...f.args, "--timeout-ms", "120000", "--json"] });
  assert.equal(p.code, 0, p.stdout + p.stderr); assert.equal(JSON.parse(p.stdout).termination, "proposed");
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("actual CLI text shows provider, budget, proposal validation, diff and unknown cost", async t => {
  const f = await fixture(t), p = await f.run({ args: f.args }); assert.equal(p.code, 0);
  for (const text of ["Provider: openai", "Model: fixture-model", "Budget:", "Patch validation: passed", "Diff:", "Estimated cost: unknown", "L3 gate: blocked"]) assert.ok(p.stdout.includes(text), text);
});
test("actual CLI L2 uses real SQLite and remains pending independent approval", async t => {
  const f = await fixture(t); const dirs = ["workspace", "journal", "checkpoints"].map(name => path.join(f.root, name)); for (const dir of dirs) await mkdir(dir, { mode: 0o700 });
  const args = [...replace(f.args, "--autonomy", "isolated"), "--authorize-workspace", "--workspace-dir", dirs[0]!, "--journal", path.join(dirs[1]!, "ops.sqlite"), "--checkpoint-dir", dirs[2]!, "--json"];
  const p = await f.run({ args }); assert.equal(p.code, 2, p.stdout); const r = JSON.parse(p.stdout); assert.equal(r.termination, "approval_required"); assert.equal(r.pendingApprovals.length, 1); assert.equal(r.patches[0].status, "proposed");
  assert.equal(await readFile(path.join(r.workspace.root, "value.ts"), "utf8"), "export const value = 1;\n");
});
for (const [flag, valued, code] of [["--model", true, "missing_model"], ["--confirm-provider-call", false, "confirmation_required"], ["--allow-uncertain-cost", false, "cost_policy_required"], ["--max-provider-requests", true, "missing_budget"], ["--max-output-tokens", true, "missing_budget"]] as const) test(`CLI requires ${flag} before HTTP`, async t => {
  const f = await fixture(t), p = await f.run({ args: [...remove(f.args, flag, valued), "--json"] }); assert.equal(p.code, 1); assert.equal(JSON.parse(p.stdout).error.code, code);
});
test("CLI missing environment credential does not load the project's .env", async t => {
  const f = await fixture(t), p = await f.run({ credential: false }); assert.equal(p.code, 1); assert.equal(JSON.parse(p.stdout).error.code, "missing_credential"); assert.doesNotMatch(p.stdout + p.stderr, /PRIVATE_LOCAL_ENV/);
});
for (const [flag, value] of [["--max-provider-requests", "0"], ["--max-output-tokens", "Infinity"], ["--max-total-tokens", "0"], ["--max-context-tokens", "0"], ["--max-agent-turns", "33"], ["--timeout-ms", "120001"]]) test(`CLI rejects invalid ${flag} budget`, async t => {
  const f = await fixture(t), args = f.args.includes(flag!) ? replace(f.args, flag!, value!) : [...f.args, flag!, value!];
  const p = await f.run({ args: [...args, "--json"] }); assert.equal(p.code, 1); assert.equal(JSON.parse(p.stdout).error.code, "invalid_budget");
});
for (const scenario of ["bad_path", "malformed", "unknown_usage", "incomplete", "quota"]) test(`CLI rejects ${scenario} with sanitized JSON and no fallback`, async t => {
  const f = await fixture(t), p = await f.run({ scenario }); assert.equal(p.code, 1); const r = JSON.parse(p.stdout); assert.equal(r.state, "Failed"); assert.doesNotMatch(p.stdout + p.stderr, /PRIVATE upstream|PRIVATE ```|PRIVATE_LOCAL_ENV|fixture-not-real/);
  if (scenario === "quota") { assert.equal(r.providerFailure.httpStatus, 429); assert.equal(r.providerFailure.httpErrorCategory, "quota_or_billing"); assert.equal(r.usage.requests, 1); }
});
test("CLI request budget and file allowlist cannot be expanded by a model", async t => {
  const f = await fixture(t), p = await f.run({ args: [...replace(f.args, "--max-provider-requests", "1"), "--json"] }); const r = JSON.parse(p.stdout); assert.equal(p.code, 1); assert.equal(r.termination, "budget"); assert.equal(r.usage.requests, 1);
  const outside = await f.run({ args: [...replace(f.args, "--files", "../outside.ts"), "--json"] }); assert.equal(outside.code, 1); assert.equal(JSON.parse(outside.stdout).usage.requests, 0);
});
test("actual CLI timeout returns 124 and cancellation returns 130", async t => {
  const f = await fixture(t), timeout = await f.run({ args: [...f.args, "--timeout-ms", "100", "--json"], scenario: "hang" }); assert.equal(timeout.code, 124, timeout.stdout + timeout.stderr); assert.equal(JSON.parse(timeout.stdout).termination, "timeout");
  const cancelled = await f.run({ scenario: "hang", cancel: true }); assert.equal(cancelled.code, 130, cancelled.stdout + cancelled.stderr); assert.equal(JSON.parse(cancelled.stdout).termination, "cancelled");
});
test("actual CLI fixture behavior remains compatible", async t => {
  const f = await fixture(t), p = await f.run({ args: ["run", "--workflow", "implement", "--path", f.source, "--request", "fixture", "--provider", "fixture", "--autonomy", "propose", "--files", "value.ts", "--fixture-file", "value.ts", "--fixture-content", "fixture result", "--json"] });
  assert.equal(p.code, 0); assert.equal(JSON.parse(p.stdout).provider, "fixture");
});

test("new full-workflow live smoke is opt-in and tested offline as an actual process", async t => {
  const f = await fixture(t), smoke = fileURLToPath(new URL("../engineering-provider-smoke.js", import.meta.url));
  const run = (scenario: string, confirmed = true, timeoutMs = "5000") => new Promise<{ code: number | null; text: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", preload, smoke], { cwd: f.source, env: { PATH: process.env.PATH, OPENAI_API_KEY: "fixture-not-real", HARNESS_TEST_OPENAI_SCENARIO: scenario,
      ...(confirmed ? { HARNESS_ENGINEERING_REAL_CONFIRM: "YES", HARNESS_ENGINEERING_ALLOW_UNCERTAIN_COST: "YES" } : {}),
      HARNESS_ENGINEERING_REAL_MODEL: "fixture-model", HARNESS_ENGINEERING_REAL_REQUEST_BUDGET: "6", HARNESS_ENGINEERING_REAL_OUTPUT_TOKEN_BUDGET: "512", HARNESS_ENGINEERING_REAL_TIMEOUT_MS: timeoutMs }, stdio: ["ignore", "pipe", "pipe"] });
    let text = ""; const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Smoke fixture deadline")); }, 10000);
    child.stdout.on("data", chunk => { text += String(chunk); }); child.on("error", error => { clearTimeout(timer); reject(error); }); child.on("close", code => { clearTimeout(timer); resolve({ code, text }); });
  });
  const skipped = await run("valid", false); assert.equal(skipped.code, 2); assert.match(skipped.text, /Skipped/);
  const success = await run("valid", true, "120000"); assert.equal(success.code, 0, success.text); const r = JSON.parse(success.text);
  assert.equal(r.smokePassed, true); assert.equal(r.sourceUnchanged, true); assert.equal(r.cleanup, "confirmed"); assert.equal(r.requests, 4); assert.equal(r.patchApplied, false);
  assert.doesNotMatch(success.text, /export const|fixture-not-real|PRIVATE_LOCAL_ENV/);
  const invalidTimeout = await run("valid", true, "120001");
  assert.equal(invalidTimeout.code, 1); assert.equal(JSON.parse(invalidTimeout.text).requests, 0);
  const wrong = await run("wrong_semantics"); assert.equal(wrong.code, 1); assert.equal(JSON.parse(wrong.text).smokePassed, false);
});
