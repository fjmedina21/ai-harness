import { AGENT_ROLES, ENGINEERING_TIME_LIMITS as LIMITS, beginTelemetry, endTelemetry,
  type AgentRole, type EngineeringPhase, type EngineeringTimingPolicy, type TelemetryBinding } from "@ai-harness/contracts";
function duration(n: number, max: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("Invalid engineering timing policy");
  return n;
}
export function resolveEngineeringTiming(globalMs: number, raw: EngineeringTimingPolicy = {}, now = Date.now()) {
  duration(globalMs, LIMITS.workflowMaxMs);
  if (Object.keys(raw).some(k => !["roleTimeoutMs", "roleTimeouts", "deadlineAt", "finalizationTimeoutMs"].includes(k))) throw new Error("Invalid engineering timing policy");
  const roleTimeoutMs = duration(raw.roleTimeoutMs ?? LIMITS.roleDefaultMs, LIMITS.roleMaxMs);
  const roleTimeouts: Partial<Record<AgentRole, number>> = {};
  if (raw.roleTimeouts !== undefined) {
    if (!raw.roleTimeouts || typeof raw.roleTimeouts !== "object" || Array.isArray(raw.roleTimeouts)) throw new Error("Invalid engineering role policy");
    for (const [role, n] of Object.entries(raw.roleTimeouts)) {
      if (!AGENT_ROLES.includes(role as AgentRole)) throw new Error("Invalid engineering role policy");
      roleTimeouts[role as AgentRole] = duration(n!, LIMITS.roleMaxMs);
    }
  }
  if (raw.deadlineAt !== undefined && (!Number.isSafeInteger(raw.deadlineAt) || raw.deadlineAt < 1 || raw.deadlineAt > now + LIMITS.workflowMaxMs)) throw new Error("Invalid absolute engineering deadline");
  return { roleTimeoutMs, roleTimeouts, finalizationTimeoutMs: duration(raw.finalizationTimeoutMs ?? LIMITS.finalizationDefaultMs, LIMITS.finalizationMaxMs),
    startedAt: now, deadlineAt: Math.min(now + globalMs, raw.deadlineAt ?? Infinity),
    scope: raw.deadlineAt !== undefined && raw.deadlineAt < now + globalMs ? "absolute" as const : "workflow" as const };
}
/** One monotonic execution deadline; child roles can only shorten it. */
export class EngineeringDeadline {
  readonly policy;
  private readonly started = performance.now();
  private readonly ends: number;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly combinedSignal: AbortSignal;
  private finalizationEnds?: number;
  constructor(globalMs: number, timing?: EngineeringTimingPolicy, private readonly parent?: AbortSignal) {
    this.policy = resolveEngineeringTiming(globalMs, timing);
    this.combinedSignal = parent ? AbortSignal.any([this.controller.signal, parent]) : this.controller.signal;
    this.ends = this.started + Math.max(0, this.policy.deadlineAt - this.policy.startedAt);
    this.timer = setTimeout(() => this.controller.abort(), Math.max(0, this.ends - performance.now()));
  }
  get signal(): AbortSignal { this.remainingMs(); return this.combinedSignal; }
  remainingMs(): number { const n = Math.max(0, Math.ceil(this.ends - performance.now())); if (!n) this.controller.abort(); return n; }
  elapsedMs(): number { return Math.max(0, performance.now() - this.started); }
  role(role: AgentRole) {
    const controller = new AbortController();
    const milliseconds = Math.min(this.remainingMs(), this.policy.roleTimeouts[role] ?? this.policy.roleTimeoutMs);
    const ends = performance.now() + milliseconds;
    const timer = setTimeout(() => controller.abort(), milliseconds);
    if (!milliseconds) controller.abort();
    const signal = AbortSignal.any([this.signal, controller.signal]);
    return { signal, check: () => { this.remainingMs(); if (performance.now() >= ends) controller.abort(); signal.throwIfAborted(); }, close: () => clearTimeout(timer) };
  }
  finalizationRemaining(): number {
    this.finalizationEnds ??= performance.now() + this.policy.finalizationTimeoutMs;
    return Math.max(0, Math.ceil(this.finalizationEnds - performance.now()));
  }
  close(): void { clearTimeout(this.timer); }
}
export function measureEngineeringPhase<T>(binding: TelemetryBinding | undefined, phase: EngineeringPhase, action: () => T): T {
  const span = beginTelemetry(binding, "engineering.phase", { phase });
  try { const result = action(); endTelemetry(span, { status: "ok" }); return result; }
  catch (error) { endTelemetry(span, { status: "error" }); throw error; }
}
export async function measureEngineeringPhaseAsync<T>(binding: TelemetryBinding | undefined, phase: EngineeringPhase, action: () => Promise<T>): Promise<T> {
  const span = beginTelemetry(binding, "engineering.phase", { phase });
  try { const result = await action(); endTelemetry(span, { status: "ok" }); return result; }
  catch (error) { endTelemetry(span, { status: "error" }); throw error; }
}
