import type { CostEstimate, CostRate, ExecutionMetrics, ExecutionTrace, MetricGroup, SpanRecord, TelemetryEvent, TokenUsage } from "@ai-harness/contracts";
import { parseTelemetryEvent } from "./jsonl-sink.js";
import { label, usage } from "./sanitize.js";

function validateRates(rates: readonly CostRate[]): void {
  if (rates.length > 256) throw new Error("Rate table limit");
  const keys = new Set<string>();
  for (const rate of rates) {
    const key = rate.provider + "\0" + rate.model;
    if (!label(rate.provider) || !label(rate.model) || !label(rate.version) || !/^[A-Z]{3}$/.test(rate.currency) ||
      !/^\d{4}-\d\d-\d\d$/.test(rate.effectiveDate) || !Number.isFinite(Date.parse(rate.effectiveDate)) || keys.has(key)) throw new Error("Invalid or duplicate cost rate");
    for (const value of [rate.inputPerMillion, rate.outputPerMillion])
      if (!Number.isFinite(value) || value < 0 || value > 1e6) throw new Error("Invalid cost rate");
    for (const value of [rate.cacheReadPerMillion, rate.cacheWritePerMillion])
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1e6)) throw new Error("Invalid cache cost rate");
    keys.add(key);
  }
}
export function estimateCost(tokens: TokenUsage | undefined, provider: string | undefined, model: string | undefined, rates: readonly CostRate[]): CostEstimate {
  validateRates(rates);
  return cost(tokens, provider, model, rates);
}
function cost(tokens: TokenUsage | undefined, provider: string | undefined, model: string | undefined, rates: readonly CostRate[]): CostEstimate {
  const u = usage(tokens);
  if (u.availability === "unavailable") return {status:"unknown", reason:"missing_usage"};
  const rate = rates.find(r => r.provider === provider && r.model === model);
  if (!rate) return {status:"unknown", reason:"missing_rate"};
  if (u.inputTokens === undefined || u.outputTokens === undefined ||
      (u.cacheReadTokens !== undefined && u.cacheReadTokens > 0 && rate.cacheReadPerMillion === undefined) ||
      (u.cacheWriteTokens !== undefined && u.cacheWriteTokens > 0 && rate.cacheWritePerMillion === undefined))
    return {status:"unknown", reason:"incomplete_usage"};
  const read = u.cacheReadTokens ?? 0, write = u.cacheWriteTokens ?? 0;
  const amount = ((u.inputTokens - read - write) * rate.inputPerMillion + u.outputTokens * rate.outputPerMillion +
    read * (rate.cacheReadPerMillion ?? 0) + write * (rate.cacheWritePerMillion ?? 0)) / 1_000_000;
  return {status:"estimated", amount, currency:rate.currency, rateVersions:[rate.version]};
}
function records(input: readonly TelemetryEvent[]): {events: TelemetryEvent[]; duplicates:number; gaps:boolean} {
  if (input.length > 100_000) throw new Error("Telemetry analysis limit");
  const seen = new Set<string>(), sessions = new Map<string, number[]>();
  const events: TelemetryEvent[] = [];
  let duplicates=0;
  for (const raw of input) {
    const event = parseTelemetryEvent(raw);
    const key = event.sessionId + ":" + event.sequence;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); events.push(event);
    const seq = sessions.get(event.sessionId) ?? [];
    seq.push(event.sequence); sessions.set(event.sessionId, seq);
  }
  let gaps=false;
  for (const seq of sessions.values()) {
    seq.sort((a,b)=>a-b);
    if (seq[0] !== 1 || seq.some((n,i)=>i>0 && n !== seq[i-1]!+1)) gaps=true;
  }
  return {events,duplicates,gaps};
}
function spanKey(event: TelemetryEvent): string { return [event.sessionId,event.context.traceId,event.context.spanId].join(":"); }
function traceFrom(data: ReturnType<typeof records>, executionId: string): ExecutionTrace {
  const spans = new Map<string,{start?:TelemetryEvent;end?:TelemetryEvent;invalid:boolean}>();
  let orphanEvents=0;
  for (const event of data.events.filter(e=>e.context.executionId === executionId)) {
    const key=spanKey(event);
    if (event.type === "event") continue;
    const item=spans.get(key) ?? {invalid:false};
    const side=event.type === "span.start" ? "start" : "end";
    if (item[side]) item.invalid=true;
    else item[side]=event;
    spans.set(key,item);
  }
  const result:SpanRecord[]=[];
  let roots=0;
  for (const [key,item] of spans) {
    const event=item.start ?? item.end!;
    const parent=event.context.parentSpanId;
    const parentKey=[event.sessionId,event.context.traceId,parent].join(":");
    const invalidParent=parent !== undefined && !spans.has(parentKey);
    if (!item.start || invalidParent) orphanEvents++;
    if (event.name === "execution" && !parent) roots++;
    result.push({context:event.context,name:event.name as SpanRecord["name"],
      ...(item.end ? {status:item.end.status,durationMs:item.end.durationMs}:{}),
      incomplete:item.invalid || !item.start || !item.end || invalidParent ||
        (item.start !== undefined && item.end !== undefined && (item.start.name !== item.end.name || item.end.sequence <= item.start.sequence ||
          item.start.context.parentSpanId !== item.end.context.parentSpanId || item.start.context.taskId !== item.end.context.taskId ||
          item.start.context.agentRole !== item.end.context.agentRole)),
    });
  }
  for (const event of data.events.filter(e=>e.context.executionId === executionId && e.type === "event"))
    if (event.context.spanId && !spans.has(spanKey(event))) orphanEvents++;
  result.sort((a,b)=>(a.context.spanId ?? "").localeCompare(b.context.spanId ?? ""));
  return {executionId,spans:result,incomplete:data.gaps || roots !== 1 || result.some(s=>s.incomplete) || orphanEvents>0 || data.duplicates>0,duplicateEvents:data.duplicates,orphanEvents};
}
export function buildExecutionTrace(events: readonly TelemetryEvent[], executionId: string): ExecutionTrace {
  if (!label(executionId)) throw new Error("Invalid execution identity");
  return traceFrom(records(events),executionId);
}
function zero(key:string):MetricGroup {
  return {key,durationMs:0,modelCalls:0,modelTurns:0,toolCalls:0,denials:0,errors:0,cancellations:0,timeouts:0,uncertain:0,
    tokens:{availability:"unavailable",reportedRequests:0,unreportedRequests:0,incompleteRequests:0},cost:{status:"unknown",reason:"missing_usage"}};
}
function accumulate(group:MetricGroup, event:TelemetryEvent, rates:readonly CostRate[], costs:Map<MetricGroup,CostEstimate[]>):void {
  if (event.type === "event") {
    if (event.name === "agent.tools_rejected") group.denials += event.attributes.toolCalls ?? 1;
    return;
  }
  if (event.type !== "span.end") return;
  if (event.status === "error") group.errors++;
  if (event.status === "cancelled") group.cancellations++;
  if (event.status === "timeout") group.timeouts++;
  if (event.name === "tool.dispatch") {
    if (event.status === "denied" || event.status === "blocked") group.denials++;
    if (event.status === "uncertain" || event.attributes.operationState === "Uncertain") group.uncertain++;
  }
  if (event.name === "model.turn") group.modelTurns++;
  if (event.name === "tool.handler") group.toolCalls++;
  if (event.name !== "provider.request") return;
  group.modelCalls++;
  const u=usage(event.usage);
  if (u.availability === "unavailable") group.tokens.unreportedRequests++;
  else {
    group.tokens.availability="reported"; group.tokens.reportedRequests++;
    if (u.inputTokens === undefined || u.outputTokens === undefined) group.tokens.incompleteRequests++;
    for (const key of ["inputTokens","outputTokens","cacheReadTokens","cacheWriteTokens","reasoningTokens"] as const)
      if (u[key] !== undefined) {
        const sum=(group.tokens[key] ?? 0)+u[key]!;
        if (!Number.isSafeInteger(sum)) throw new Error("Token aggregation overflow");
        group.tokens[key]=sum;
      }
  }
  const list=costs.get(group) ?? [];
  list.push(cost(u,event.attributes.provider,event.attributes.model,rates)); costs.set(group,list);
}
function combinedCost(items:readonly CostEstimate[]):CostEstimate {
  if (!items.length) return {status:"unknown",reason:"missing_usage"};
  const known=items.filter((c):c is Extract<CostEstimate,{status:"estimated"}>=>c.status==="estimated");
  const currencies=new Set(known.map(c=>c.currency));
  if (currencies.size>1) return {status:"unknown",reason:"mixed_currency"};
  const currency=known[0]?.currency;
  const amount=known.reduce((n,c)=>n+c.amount,0);
  const unknown=items.find(c=>c.status==="unknown");
  if (unknown?.status==="unknown") return {status:"unknown",reason:unknown.reason,...(known.length?{knownAmount:amount,currency}:{})};
  return {status:"estimated",amount,currency:currency!,rateVersions:[...new Set(known.flatMap(c=>c.rateVersions))].sort()};
}
/** Durations within groups use only their owning spans; latency arrays retain individual requests. */
export function buildExecutionMetrics(input:readonly TelemetryEvent[],executionId:string,rates:readonly CostRate[]=[]):ExecutionMetrics {
  validateRates(rates);
  if (!label(executionId)) throw new Error("Invalid execution identity");
  const data=records(input), trace=traceFrom(data,executionId);
  const events=data.events.filter(e=>e.context.executionId===executionId);
  const root=zero(executionId), tasks=new Map<string,MetricGroup>(), agents=new Map<string,MetricGroup>(), providers=new Map<string,MetricGroup>();
  const costs=new Map<MetricGroup,CostEstimate[]>();
  const modelLatencyMs:number[]=[],httpLatencyMs:number[]=[],toolLatencyMs:number[]=[];
  for (const event of events) {
    const groups=[root];
    for (const [map,key] of [[tasks,event.context.taskId],[agents,event.context.agentRole],[providers,event.attributes.provider]] as const) {
      if (!key) continue;
      const group=map.get(key) ?? zero(key);
      if (map.size>=1024 && !map.has(key)) throw new Error("Metric cardinality limit");
      map.set(key,group);groups.push(group);
    }
    for (const group of groups) accumulate(group,event,rates,costs);
    if (event.type!=="span.end") continue;
    const duration=event.durationMs!;
    if (event.name==="execution") root.durationMs+=duration;
    if (event.name==="task" && event.context.taskId) tasks.get(event.context.taskId)!.durationMs+=duration;
    if (event.name==="agent" && event.context.agentRole) agents.get(event.context.agentRole)!.durationMs+=duration;
    if (event.name==="provider.request") {
      modelLatencyMs.push(duration);
      if (event.attributes.provider) providers.get(event.attributes.provider)!.durationMs+=duration;
    }
    if (event.name==="provider.http") httpLatencyMs.push(duration);
    if (event.name==="tool.handler") toolLatencyMs.push(duration);
  }
  for (const group of [root,...tasks.values(),...agents.values(),...providers.values()]) group.cost=combinedCost(costs.get(group) ?? []);
  const byKey=(map:Map<string,MetricGroup>)=>[...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
  const complete=!trace.incomplete;
  // Captured partial totals must never be represented as a complete cost estimate.
  if (!complete && root.cost.status==="estimated") root.cost={status:"unknown",reason:"incomplete_usage",knownAmount:root.cost.amount,currency:root.cost.currency};
  const reviewRequired=!complete || root.uncertain>0 || root.denials>0 || root.errors>0 || root.cancellations>0 || root.timeouts>0 ||
    events.some(e=>e.attributes.approvalRequired===true || e.status==="blocked");
  return {...root,executionId,complete,reviewRequired,byTask:byKey(tasks),byAgent:byKey(agents),byProvider:byKey(providers),modelLatencyMs,httpLatencyMs,toolLatencyMs};
}
