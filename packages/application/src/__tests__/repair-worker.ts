/** TEST ONLY; independent-process durable lifecycle with synthetic presence/runtime. */
import { openRepairFixture } from "./repair-fixture.js";
const [base, id, mode] = process.argv.slice(2);
try {
  const f = await openRepairFixture(base!); f.binding.id = id!;
  try {
    let state: string | undefined;
    if (mode === "approve") await f.approvePatch(f.artifact());
    else if (mode === "apply") await f.apply(f.artifact());
    else if (mode === "validate") await f.validate(f.artifact());
    else state = (await f.coordinator().advance(id!)).state;
    process.send?.({ ok: true, pid: process.pid, state, runtimeCalls: f.calls() });
  } finally { f.store.close(); }
} catch { process.send?.({ ok: false, pid: process.pid }); }
