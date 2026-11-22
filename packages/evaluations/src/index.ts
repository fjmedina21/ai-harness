import { performance } from "node:perf_hooks";

export type EvaluationCategory = "functional" | "security" | "reliability" | "efficiency";
export type EvaluationValue = string | number | boolean | null;
export interface EvaluationObservation {
  /** Host-selected bounded facts. Never return prompts, payloads or credentials. */
  facts: Readonly<Record<string, EvaluationValue>>;
  metrics?: Readonly<Record<string, number>>;
}
export type EvaluationAssertion =
  | { id: string; fact: string; kind: "equals"; expected: EvaluationValue }
  | { id: string; fact: string; kind: "number"; expected: number; absoluteTolerance: number };
export interface EvaluationScenario {
  id: string;
  version: string;
  category: EvaluationCategory;
  assertions: readonly EvaluationAssertion[];
  /** Trusted host fixture. Models cannot supply this function or its assertions. */
  execute(context: { signal: AbortSignal }): Promise<EvaluationObservation>;
}
export interface EvaluationAssertionResult { id: string; passed: boolean; actual?: EvaluationValue; expected: EvaluationValue }
export interface EvaluationResult {
  scenarioId: string;
  scenarioVersion: string;
  category: EvaluationCategory;
  status: "passed" | "failed" | "cancelled";
  failureKind?: "assertion" | "execution" | "timeout" | "cancelled";
  assertions: readonly EvaluationAssertionResult[];
  metrics: Readonly<Record<string, number>>;
  /** Only present when a host explicitly enables timing; not logical fixture time. */
  durationMs?: number;
}
export interface EvaluationReport {
  schemaVersion: 1;
  suiteId: string;
  suiteVersion: string;
  configurationId: string;
  timing: "disabled" | "measured";
  results: readonly EvaluationResult[];
  summary: { total: number; passed: number; failed: number; cancelled: number; assertions: number; passedAssertions: number; passRate: number };
}
export interface EvaluationSuite { id: string; version: string; configurationId: string; scenarios: readonly EvaluationScenario[] }
export interface EvaluationRunnerOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Host monotonic clock; enabling this makes wall duration comparisons environment-dependent. */
  measureDuration?: boolean;
  now?: () => number;
}
export const EVALUATION_LIMITS = { scenarios: 128, assertions: 64, facts: 128, metrics: 64, reportBytes: 1_048_576, timeoutMs: 30_000 } as const;
const categories: readonly string[] = ["functional", "security", "reliability", "efficiency"];
const labelPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function label(value: unknown): value is string { return typeof value === "string" && labelPattern.test(value); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER; }
function scalar(value: unknown): value is EvaluationValue { return value === null || typeof value === "boolean" || finite(value) || (typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9 ._:-]*$/.test(value)); }
function only(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every(key => keys.includes(key)); }
function validateAssertion(value: unknown): asserts value is EvaluationAssertion {
  if (!object(value) || !label(value.id) || !label(value.fact) ||
      !only(value, ["id", "fact", "kind", "expected", "absoluteTolerance"]) ||
      (value.kind === "equals" ? !scalar(value.expected) :
       value.kind === "number" ? !finite(value.expected) || !finite(value.absoluteTolerance) || value.absoluteTolerance < 0 : true))
    throw new Error("Invalid evaluation assertion");
  if (value.kind === "equals" && Object.hasOwn(value, "absoluteTolerance")) throw new Error("Invalid evaluation assertion");
}
function validateSuite(suite: EvaluationSuite): void {
  if (!label(suite.id) || !label(suite.version) || !label(suite.configurationId) || !Array.isArray(suite.scenarios) ||
      suite.scenarios.length === 0 || suite.scenarios.length > EVALUATION_LIMITS.scenarios) throw new Error("Invalid evaluation suite");
  const ids = new Set<string>();
  for (const scenario of suite.scenarios) {
    if (!scenario || !label(scenario.id) || ids.has(scenario.id) || !label(scenario.version) ||
        !categories.includes(scenario.category) || typeof scenario.execute !== "function" ||
        !Array.isArray(scenario.assertions) || scenario.assertions.length === 0 || scenario.assertions.length > EVALUATION_LIMITS.assertions)
      throw new Error("Invalid evaluation scenario");
    ids.add(scenario.id);
    const assertionIds = new Set<string>();
    for (const assertion of scenario.assertions) {
      validateAssertion(assertion);
      if (assertionIds.has(assertion.id)) throw new Error("Duplicate evaluation assertion");
      assertionIds.add(assertion.id);
    }
  }
}
function observation(raw: unknown): EvaluationObservation {
  if (!object(raw) || !only(raw, ["facts", "metrics"]) || !object(raw.facts) || Object.keys(raw.facts).length > EVALUATION_LIMITS.facts)
    throw new Error("Invalid evaluation observation");
  const facts: Record<string, EvaluationValue> = Object.create(null) as Record<string, EvaluationValue>;
  for (const [key, value] of Object.entries(raw.facts)) {
    if (!label(key) || ["__proto__", "prototype", "constructor"].includes(key) || !scalar(value)) throw new Error("Invalid evaluation fact");
    facts[key] = value;
  }
  const metrics: Record<string, number> = Object.create(null) as Record<string, number>;
  if (raw.metrics !== undefined) {
    if (!object(raw.metrics) || Object.keys(raw.metrics).length > EVALUATION_LIMITS.metrics) throw new Error("Invalid evaluation metrics");
    for (const [key, value] of Object.entries(raw.metrics)) {
      if (!label(key) || ["__proto__", "prototype", "constructor"].includes(key) || !finite(value) || value < 0) throw new Error("Invalid evaluation metric");
      metrics[key] = value;
    }
  }
  return { facts, metrics };
}
function summarize(results: readonly EvaluationResult[]): EvaluationReport["summary"] {
  const passed = results.filter(result => result.status === "passed").length;
  const failed = results.filter(result => result.status === "failed").length;
  const cancelled = results.filter(result => result.status === "cancelled").length;
  const assertions = results.reduce((count, result) => count + result.assertions.length, 0);
  return { total: results.length, passed, failed, cancelled, assertions,
    passedAssertions: results.reduce((count, result) => count + result.assertions.filter(assertion => assertion.passed).length, 0),
    passRate: results.length ? passed / results.length : 0 };
}

/** Sequential bounded host fixtures. Async deadlines cannot preempt malicious synchronous host code. */
export class EvaluationRunner {
  async run(suite: EvaluationSuite, options: EvaluationRunnerOptions = {}): Promise<EvaluationReport> {
    validateSuite(suite);
    const timeoutMs = options.timeoutMs ?? EVALUATION_LIMITS.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid evaluation timeout");
    const scenarios = suite.scenarios.map(scenario => ({ ...scenario, assertions: structuredClone(scenario.assertions) }));
    const results: EvaluationResult[] = [];
    for (const scenario of scenarios) {
      const base = { scenarioId: scenario.id, scenarioVersion: scenario.version, category: scenario.category };
      if (options.signal?.aborted) {
        results.push({ ...base, status: "cancelled", failureKind: "cancelled", assertions: [], metrics: {} });
        continue;
      }
      const controller = new AbortController();
      let rejectInterrupted: (error: Error) => void = () => {};
      let timedOut = false;
      const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
      const onAbort = () => { controller.abort(); rejectInterrupted(new Error("Evaluation cancelled")); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectInterrupted(new Error("Evaluation timed out")); }, timeoutMs);
      const now = options.now ?? (() => performance.now());
      const started = options.measureDuration ? now() : undefined;
      let result: EvaluationResult;
      try {
        const pending = Promise.resolve().then(() => scenario.execute({ signal: controller.signal }));
        const observed = observation(await Promise.race([pending, interrupted]));
        if (options.signal?.aborted || timedOut) throw new Error("Evaluation interrupted");
        const assertions = scenario.assertions.map(assertion => {
          const actual = observed.facts[assertion.fact];
          const passed = Object.hasOwn(observed.facts, assertion.fact) &&
            (assertion.kind === "equals" ? actual === assertion.expected :
             typeof actual === "number" && Math.abs(actual - assertion.expected) <= assertion.absoluteTolerance);
          return { id: assertion.id, passed, ...(actual !== undefined ? { actual } : {}), expected: assertion.expected };
        });
        const passed = assertions.every(assertion => assertion.passed);
        result = { ...base, status: passed ? "passed" : "failed", ...(passed ? {} : { failureKind: "assertion" as const }), assertions, metrics: observed.metrics ?? {} };
      } catch {
        result = { ...base, status: options.signal?.aborted ? "cancelled" : "failed",
          failureKind: options.signal?.aborted ? "cancelled" : timedOut ? "timeout" : "execution", assertions: [], metrics: {} };
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
      if (started !== undefined) {
        const ended = now();
        if (!finite(started) || !finite(ended) || ended < started) throw new Error("Invalid evaluation clock");
        result.durationMs = ended - started;
      }
      results.push(result);
    }
    const report: EvaluationReport = { schemaVersion: 1, suiteId: suite.id, suiteVersion: suite.version, configurationId: suite.configurationId,
      timing: options.measureDuration ? "measured" : "disabled", results, summary: summarize(results) };
    if (Buffer.byteLength(JSON.stringify(report), "utf8") > EVALUATION_LIMITS.reportBytes) throw new Error("Evaluation report limit exceeded");
    return report;
  }
}

/** Validate external reports before rendering/comparing; no executable scenarios are loaded. */
export function parseEvaluationReport(raw: unknown): EvaluationReport {
  if (!object(raw) || !only(raw, ["schemaVersion", "suiteId", "suiteVersion", "configurationId", "timing", "results", "summary"]) ||
      raw.schemaVersion !== 1 || !label(raw.suiteId) || !label(raw.suiteVersion) || !label(raw.configurationId) ||
      !["disabled", "measured"].includes(String(raw.timing)) || !Array.isArray(raw.results) || raw.results.length === 0 ||
      raw.results.length > EVALUATION_LIMITS.scenarios) throw new Error("Invalid evaluation report");
  const ids = new Set<string>();
  const results: EvaluationResult[] = [];
  for (const candidate of raw.results) {
    if (!object(candidate) || !only(candidate, ["scenarioId", "scenarioVersion", "category", "status", "failureKind", "assertions", "metrics", "durationMs"]) ||
        !label(candidate.scenarioId) || ids.has(candidate.scenarioId) || !label(candidate.scenarioVersion) ||
        !categories.includes(String(candidate.category)) || !["passed", "failed", "cancelled"].includes(String(candidate.status)) ||
        !Array.isArray(candidate.assertions) || candidate.assertions.length > EVALUATION_LIMITS.assertions ||
        !object(candidate.metrics) || Object.keys(candidate.metrics).length > EVALUATION_LIMITS.metrics ||
        (candidate.durationMs !== undefined && (!finite(candidate.durationMs) || candidate.durationMs < 0)) ||
        (raw.timing === "disabled" && candidate.durationMs !== undefined)) throw new Error("Invalid evaluation result");
    ids.add(candidate.scenarioId);
    const assertionIds = new Set<string>();
    const assertions: EvaluationAssertionResult[] = [];
    for (const assertion of candidate.assertions) {
      if (!object(assertion) || !only(assertion, ["id", "passed", "actual", "expected"]) || !label(assertion.id) || assertionIds.has(assertion.id) ||
          typeof assertion.passed !== "boolean" || !scalar(assertion.expected) ||
          (Object.hasOwn(assertion, "actual") && !scalar(assertion.actual))) throw new Error("Invalid evaluation result assertion");
      assertionIds.add(assertion.id);
      assertions.push({ id: assertion.id, passed: assertion.passed, expected: assertion.expected,
        ...(Object.hasOwn(assertion, "actual") ? { actual: assertion.actual as EvaluationValue } : {}) });
    }
    const metrics = observation({ facts: {}, metrics: candidate.metrics }).metrics!;
    const status = candidate.status as EvaluationResult["status"];
    const failureKind = candidate.failureKind as EvaluationResult["failureKind"];
    if (status === "passed" ? candidate.failureKind !== undefined || !assertions.length || assertions.some(assertion => !assertion.passed) :
        !["assertion", "execution", "timeout", "cancelled"].includes(String(failureKind)) ||
        (status === "cancelled") !== (failureKind === "cancelled") ||
        (failureKind === "assertion" && !assertions.some(assertion => !assertion.passed))) throw new Error("Inconsistent evaluation result");
    results.push({ scenarioId: candidate.scenarioId, scenarioVersion: candidate.scenarioVersion, category: candidate.category as EvaluationCategory,
      status, ...(failureKind ? { failureKind } : {}), assertions, metrics, ...(candidate.durationMs !== undefined ? { durationMs: candidate.durationMs as number } : {}) });
  }
  const summary = summarize(results);
  if (!object(raw.summary) || !only(raw.summary, Object.keys(summary)) || Object.keys(summary).some(key => (raw.summary as Record<string, unknown>)[key] !== summary[key as keyof typeof summary]))
    throw new Error("Inconsistent evaluation summary");
  const report: EvaluationReport = { schemaVersion: 1, suiteId: raw.suiteId, suiteVersion: raw.suiteVersion, configurationId: raw.configurationId,
    timing: raw.timing as EvaluationReport["timing"], results, summary };
  if (Buffer.byteLength(JSON.stringify(report), "utf8") > EVALUATION_LIMITS.reportBytes) throw new Error("Evaluation report limit exceeded");
  return report;
}

export interface EvaluationMetricTolerance { metric: string; direction: "lower" | "higher"; absolute: number; relative: number }
export interface EvaluationRegression { scenarioId: string; kind: "scenario_missing" | "result" | "metric" | "metric_unavailable"; metric?: string; baseline?: number; candidate?: number }
export interface EvaluationComparison { comparable: boolean; regressions: readonly EvaluationRegression[]; improvements: number }
export function compareEvaluationReports(baselineRaw: EvaluationReport, candidateRaw: EvaluationReport, tolerances: readonly EvaluationMetricTolerance[] = []): EvaluationComparison {
  const baseline = parseEvaluationReport(baselineRaw), candidate = parseEvaluationReport(candidateRaw);
  if (tolerances.length > EVALUATION_LIMITS.metrics) throw new Error("Invalid evaluation tolerances");
  const metricNames = new Set<string>();
  for (const tolerance of tolerances) {
    if (!label(tolerance.metric) || metricNames.has(tolerance.metric) || !["lower", "higher"].includes(tolerance.direction) ||
        !finite(tolerance.absolute) || tolerance.absolute < 0 || !finite(tolerance.relative) || tolerance.relative < 0 || tolerance.relative > 1)
      throw new Error("Invalid evaluation tolerance");
    metricNames.add(tolerance.metric);
  }
  const comparable = baseline.suiteId === candidate.suiteId && baseline.suiteVersion === candidate.suiteVersion &&
    baseline.results.every(result => candidate.results.find(item => item.scenarioId === result.scenarioId)?.scenarioVersion === result.scenarioVersion);
  const regressions: EvaluationRegression[] = [];
  let improvements = 0;
  for (const before of baseline.results) {
    const after = candidate.results.find(result => result.scenarioId === before.scenarioId);
    if (!after) { regressions.push({ scenarioId: before.scenarioId, kind: "scenario_missing" }); continue; }
    if (before.status === "passed" && after.status !== "passed") regressions.push({ scenarioId: before.scenarioId, kind: "result" });
    if (before.status !== "passed" && after.status === "passed") improvements++;
    for (const tolerance of tolerances) {
      const prior = before.metrics[tolerance.metric], next = after.metrics[tolerance.metric];
      if (prior === undefined) continue;
      if (next === undefined) { regressions.push({ scenarioId: before.scenarioId, kind: "metric_unavailable", metric: tolerance.metric, baseline: prior }); continue; }
      const allowed = Math.max(tolerance.absolute, Math.abs(prior) * tolerance.relative);
      const delta = tolerance.direction === "lower" ? next - prior : prior - next;
      if (delta > allowed) regressions.push({ scenarioId: before.scenarioId, kind: "metric", metric: tolerance.metric, baseline: prior, candidate: next });
    }
  }
  return { comparable, regressions, improvements };
}

export { createDeterministicEvaluationSuite, runDeterministicEvaluations } from "./deterministic.js";
