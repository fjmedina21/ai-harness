import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { compareEvaluationReports, EVALUATION_LIMITS, parseEvaluationReport, runDeterministicEvaluations } from "@ai-harness/evaluations";
import { buildExecutionMetrics, buildExecutionTrace, readTelemetryJsonl } from "@ai-harness/observability";

function value(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag); if (index === -1) return undefined;
  if (!args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error("Invalid diagnostic arguments");
  return args[index + 1];
}
function allowed(args: readonly string[], flags: readonly string[]): void {
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    if (!flags.includes(flag) || seen.has(flag)) throw new Error("Invalid diagnostic arguments");
    seen.add(flag); value(args, flag);
  }
}
async function readReport(filename: string) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before = await lstat(filename);
    if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o077) !== 0 || before.uid !== process.getuid?.() ||
        before.size > EVALUATION_LIMITS.reportBytes || before.size === 0) throw new Error("Invalid report file");
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev || stat.nlink !== 1 || (stat.mode & 0o077) !== 0)
      throw new Error("Invalid report file");
    const buffer = Buffer.alloc(EVALUATION_LIMITS.reportBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (read.bytesRead === 0) break; bytes += read.bytesRead;
    }
    if (bytes > EVALUATION_LIMITS.reportBytes) throw new Error("Report size limit");
    return parseEvaluationReport(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes))));
  } finally { await handle?.close(); }
}
/** Explicit, offline diagnostic commands. No authority, repair, resume or network operations. */
export async function diagnosticCommand(command: string, args: string[], cwd: string, output: (line: string) => void): Promise<number> {
  try {
    if (command === "eval") {
      const [action, ...options] = args;
      if (action === "run") {
        allowed(options, ["--suite"]);
        if (value(options, "--suite") !== "deterministic") throw new Error("Unknown evaluation suite");
        const report = await runDeterministicEvaluations();
        output(JSON.stringify(report, null, 2));
        return report.summary.passed === report.summary.total ? 0 : 1;
      }
      if (action === "report") {
        allowed(options, ["--input", "--baseline"]);
        const input = value(options, "--input"); if (!input) throw new Error("Report input required");
        const report = await readReport(path.resolve(cwd, input));
        const baseline = value(options, "--baseline");
        if (baseline) {
          const comparison = compareEvaluationReports(await readReport(path.resolve(cwd, baseline)), report);
          output(JSON.stringify({ report, comparison }, null, 2));
          return comparison.comparable && comparison.regressions.length === 0 && report.summary.passed === report.summary.total ? 0 : 1;
        }
        output(JSON.stringify(report, null, 2));
        return report.summary.passed === report.summary.total ? 0 : 1;
      }
      throw new Error("Unknown evaluation command");
    }
    allowed(args, ["--input", "--id"]);
    const input = value(args, "--input"), executionId = value(args, "--id");
    if (!input || !executionId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(executionId)) throw new Error("Diagnostic input required");
    // Keep the CLI boundary error sanitized while retaining the specific cause for tests/host diagnostics.
    const events = await readTelemetryJsonl(path.resolve(cwd, input));
    if (!events.some(event => event.context.executionId === executionId)) throw new Error("Execution unavailable");
    output(JSON.stringify(command === "trace" ? buildExecutionTrace(events, executionId) : buildExecutionMetrics(events, executionId), null, 2));
    return 0;
  } catch {
    // Paths, unknown command arguments, input JSON and upstream errors are never echoed.
    console.error("Error: diagnostic command failed; check private input, schema and arguments.");
    return 1;
  }
}
