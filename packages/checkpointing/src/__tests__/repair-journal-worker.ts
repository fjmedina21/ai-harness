import { openSqliteOperationJournal } from "../sqlite-journal.js";
const store = await openSqliteOperationJournal(process.argv[2]!);
const s = store.repair!.get("repair-execution")!;
process.send?.("ready");
process.once("message", () => {
  let result = "blocked";
  try {
    store.repair!.compareAndSwap(s.sessionId, s.version, { ...s, state: "AnalyzingDiagnostics", version: s.version + 1, consumed: { ...s.consumed, providerRequests: 1 }, reserved: { ...s.reserved, inputTokens: 100 } });
    result = "claimed";
  } catch { /* A concurrent claimant fences this process. */ }
  store.close(); process.send?.(result, () => process.disconnect());
});
