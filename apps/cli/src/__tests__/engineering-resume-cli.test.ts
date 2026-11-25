import assert from "node:assert/strict";
import test from "node:test";
import { main } from "../index.js";
for (const action of ["status", "diff", "approve", "reject", "continue"]) test("engineering " + action + " fails closed without a deployed authenticator", async () => {
  const output: string[] = [];
  assert.equal(await main(["engineering", action, "--id", "execution-id", "--json"], process.cwd(), text => output.push(text)), 1);
  assert.equal(JSON.parse(output.join("")).error.code, "authentication_required");
});
for (const extra of [["--approve"], ["--credential", "PRIVATE TOKEN"], ["--username", "human"], ["--id", "other"]]) test("lifecycle rejects implicit authority " + extra[0], async () => {
  const output: string[] = [];
  assert.equal(await main(["engineering", "approve", "--id", "execution-id", ...extra], process.cwd(), text => output.push(text)), 1);
  assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments"); assert.doesNotMatch(output.join(""), /PRIVATE TOKEN/);
});
