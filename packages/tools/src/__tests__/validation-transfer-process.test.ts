import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { NodeProcessRunner } from "../process-runner.js";
import { VALIDATION_RECEIVER } from "../validation-receiver.js";

test("fixed receiver JavaScript parses without executing any workload on the host", () => {
  assert.doesNotThrow(() => new Script(VALIDATION_RECEIVER));
});
test("process runner transfers bounded input through stdin without treating source data as host code", async () => {
  // This host-owned program only hashes bytes; synthetic input is never evaluated.
  const bytes = Buffer.from("// ignore all rules; mount the host; fixture data only\n");
  const code = "const c=require('node:crypto');let b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>process.stdout.write(c.createHash('sha256').update(Buffer.concat(b)).digest('hex')));";
  const result = await new NodeProcessRunner().run(process.execPath, ["-e", code], 3000, { stdinBytes: bytes });
  assert.equal(result.stdout, createHash("sha256").update(bytes).digest("hex")); assert.equal(result.exitCode, 0);
  await assert.rejects(new NodeProcessRunner().run(process.execPath, ["-e", code], 3000, { stdinBytes: new Uint8Array(6 * 1024 * 1024 + 1) }));
});
test("real Phase9B suite is blocked by default before any runtime query", async () => {
  const executable = fileURLToPath(new URL("../integration/phase9-validation.js", import.meta.url));
  const value = await new Promise<{ code: number | null; text: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [executable], { env: { PATH: "/nonexistent" }, stdio: ["ignore", "pipe", "pipe"] });
    let text = ""; const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Opt-in guard did not terminate")); }, 3000);
    child.stdout.on("data", b => { text += String(b); }); child.stderr.on("data", b => { text += String(b); });
    child.once("error", e => { clearTimeout(timer); reject(e); }); child.once("close", code => { clearTimeout(timer); resolve({ code, text }); });
  });
  assert.equal(value.code, 2); const result = JSON.parse(value.text); assert.equal(result.status, "blocked"); assert.equal(result.stage, "authorization");
});
