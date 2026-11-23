import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "../index.js";
async function setup(t: TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-phase9-cli-"))), source = path.join(root, "source");
  await mkdir(source, { mode: 0o700 }); await writeFile(path.join(source, "value.ts"), "before\n", { mode: 0o600 });
  t.after(() => rm(root, { recursive: true, force: true }));
  const args = ["run", "--workflow", "implement", "--path", source, "--request", "fixture replacement", "--provider", "fixture", "--autonomy", "propose", "--files", "value.ts", "--fixture-file", "value.ts", "--fixture-content", "after\n"];
  return { root, source, args };
}
test("CLI L1 JSON shows structured proposal and changes no project files", async t => {
  const f = await setup(t), output: string[] = [];
  assert.equal(await main([...f.args, "--json"], f.root, line => output.push(line)), 0);
  const result = JSON.parse(output.join("")); assert.equal(result.state, "Proposed"); assert.equal(result.provider, "fixture");
  assert.equal(result.l3Gate, "blocked"); assert.equal(result.integrated, false); assert.equal(result.diffScope, "proposed");
  assert.deepEqual(result.filesModified, ["value.ts"]); assert.equal(result.usage.estimatedCostUsd, 0);
  assert.deepEqual(await readdir(f.source), ["value.ts"]); assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "before\n");
});
test("CLI L1 text shows plan, scope, provider, budget, diff, risk and states", async t => {
  const f = await setup(t), output: string[] = [];
  assert.equal(await main(f.args, f.root, line => output.push(line)), 0);
  for (const word of ["Plan:", "Permissions:", "Provider:", "Budget:", "Diff:", "Risk:", "States:", "L3 gate: blocked"]) assert.ok(output.join("\n").includes(word));
});
test("CLI isolated mode creates external workspace but pauses at independent durable approval", async t => {
  const f = await setup(t), output: string[] = [];
  const directories = ["workspaces", "journal", "checkpoints"].map(name => path.join(f.root, name));
  for (const directory of directories) await mkdir(directory, { mode: 0o700 });
  const args = f.args.map(a => a === "propose" ? "isolated" : a);
  const code = await main([...args, "--workspace-dir", directories[0]!, "--journal", path.join(directories[1]!, "ops.sqlite"), "--checkpoint-dir", directories[2]!, "--authorize-workspace", "--json"], f.root, line => output.push(line));
  assert.equal(code, 2); const result = JSON.parse(output.join(""));
  assert.equal(result.termination, "approval_required"); assert.equal(result.pendingApprovals.length, 1); assert.equal(result.patches[0].status, "proposed");
  assert.ok(result.workspace.root.startsWith(directories[0])); assert.equal(await readFile(path.join(result.workspace.root, "value.ts"), "utf8"), "before\n");
  assert.deepEqual(await readdir(f.source), ["value.ts"]);
});
for (const extra of [["--provider", "openai"], ["--autonomy", "repair"], ["--autonomy", "isolated"], ["--files", "../escape"], ["--max-iterations", "0"], ["--unexpected", "true"]]) test(`CLI rejects unsupported authority or malformed option ${extra.join(" ")}`, async t => {
  const f = await setup(t), args = [...f.args]; const index = args.indexOf(extra[0]!); if (index >= 0) args[index + 1] = extra[1]!; else args.push(...extra); assert.equal(await main(args, f.root, () => {}), 1); assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "before\n");
});
test("CLI sanitizes terminal control sequences in displayed fixture diffs", async t => {
  const f = await setup(t), output: string[] = [], args = [...f.args]; args[args.length - 1] = "after\u001b[31mred";
  assert.equal(await main(args, f.root, line => output.push(line)), 1); assert.doesNotMatch(output.join(""), /\u001b/);
});
test("CLI rejects original-project evidence paths before creating a journal", async t => {
  const f = await setup(t), args = f.args.map(a => a === "propose" ? "isolated" : a);
  assert.equal(await main([...args, "--workspace-dir", f.source, "--journal", path.join(f.source, "ops.sqlite"), "--checkpoint-dir", f.source, "--authorize-workspace"], f.root, () => {}), 1);
  assert.deepEqual(await readdir(f.source), ["value.ts"]);
});
