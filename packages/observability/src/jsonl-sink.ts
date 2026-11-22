import { constants, type Stats } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { AGENT_ROLES } from "@ai-harness/contracts";
import type { TelemetryEvent, TelemetrySink } from "@ai-harness/contracts";
import { attributes, EVENTS, label, SPANS, STATUSES, usage } from "./sanitize.js";

function validStat(stat: Stats, directory = false): boolean {
  return (directory ? stat.isDirectory() : stat.isFile()) && !stat.isSymbolicLink() &&
    (directory || stat.nlink === 1) && (stat.mode & 0o077) === 0 &&
    (process.getuid === undefined || stat.uid === process.getuid());
}
async function inspect(file: string, optional = false): Promise<Stats | undefined> {
  try { const stat = await lstat(file); if (!validStat(stat)) throw new Error("Unsafe telemetry file"); return stat; }
  catch (error) { if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export interface JsonlTelemetryOptions {
  directory: string;
  maxFileBytes?: number;
  /** Total files, including current; 1 discards the current file on rotation. */
  maxFiles?: number;
}
/** Single-writer diagnostic sink. Not a transactional journal or multiprocess exporter. */
export class JsonlTelemetrySink implements TelemetrySink {
  private readonly file;
  private readonly maxFileBytes;
  private readonly maxFiles;
  private writing = false;
  rotated = 0;
  discardedFiles = 0;
  constructor(private readonly options: JsonlTelemetryOptions) {
    this.file = path.join(options.directory, "telemetry.jsonl");
    this.maxFileBytes = options.maxFileBytes ?? 1_048_576;
    this.maxFiles = options.maxFiles ?? 3;
    if (!path.isAbsolute(options.directory) || !Number.isSafeInteger(this.maxFileBytes) || this.maxFileBytes < 1024 || this.maxFileBytes > 16_777_216 ||
        !Number.isSafeInteger(this.maxFiles) || this.maxFiles < 1 || this.maxFiles > 10) throw new Error("Invalid JSONL limits");
  }
  private archive(index: number): string { return this.file + "." + index; }
  async write(event: Readonly<TelemetryEvent>): Promise<void> {
    if (this.writing) throw new Error("Concurrent JSONL writers are unsupported");
    this.writing = true;
    try {
      // Reconstruct through the schema at the public sink boundary as well.
      const line = JSON.stringify(parseTelemetryEvent(event)) + "\n";
      const bytes = Buffer.byteLength(line);
      if (bytes > 2048 || bytes > this.maxFileBytes) throw new Error("Telemetry record limit");
      const dir = await lstat(this.options.directory);
      if (!validStat(dir, true) || !(await realpath(this.options.directory)).startsWith(path.parse(await realpath(this.options.directory)).root)) throw new Error("Unsafe telemetry directory");
      const current = await inspect(this.file, true);
      for (let i = 1; i < this.maxFiles; i++) {
        const archived = await inspect(this.archive(i), true);
        if (archived && archived.size > this.maxFileBytes) throw new Error("Oversized telemetry archive");
      }
      if (current && current.size > this.maxFileBytes) throw new Error("Oversized telemetry file");
      if (current && current.size + bytes > this.maxFileBytes) {
        const last = this.maxFiles === 1 ? this.file : this.archive(this.maxFiles - 1);
        if (await inspect(last, true)) { await unlink(last); this.discardedFiles++; }
        for (let i = this.maxFiles - 2; i >= 1; i--) {
          if (await inspect(this.archive(i), true)) await rename(this.archive(i), this.archive(i + 1));
        }
        if (this.maxFiles > 1) await rename(this.file, this.archive(1));
        this.rotated++;
      }
      const fd = await open(this.file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try {
        const stat = await fd.stat();
        const named = await inspect(this.file);
        if (!validStat(stat) || !named || stat.ino !== named.ino || stat.dev !== named.dev || stat.size + bytes > this.maxFileBytes) throw new Error("Unsafe telemetry file");
        await fd.writeFile(line, "utf8");
      } finally { await fd.close(); }
    } finally { this.writing = false; }
  }
}
function record(value: unknown): value is Record<string, unknown> {return !!value && typeof value === "object" && !Array.isArray(value);}
export function parseTelemetryEvent(raw: unknown): TelemetryEvent {
  if (!record(raw) || raw.schemaVersion !== 1 || !label(raw.sessionId) || !Number.isSafeInteger(raw.sequence) || (raw.sequence as number) < 1 ||
      typeof raw.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.timestamp) || !Number.isFinite(Date.parse(raw.timestamp)) ||
      !record(raw.context) || !label(raw.context.executionId) || !label(raw.context.traceId) ||
      !["span.start", "span.end", "event"].includes(raw.type as string) || !record(raw.attributes)) throw new Error("Invalid telemetry record");
  const ctx = raw.context;
  for (const key of ["spanId", "parentSpanId", "taskId"] as const)
    if (ctx[key] !== undefined && !label(ctx[key])) throw new Error("Invalid telemetry context");
  if (ctx.agentRole !== undefined && !AGENT_ROLES.includes(ctx.agentRole as typeof AGENT_ROLES[number])) throw new Error("Invalid telemetry role");
  if (raw.type === "event" ? !EVENTS.includes(raw.name as typeof EVENTS[number]) : !SPANS.includes(raw.name as typeof SPANS[number]) || !ctx.spanId) throw new Error("Invalid telemetry event name");
  if (raw.type === "span.end" && (!STATUSES.includes(raw.status as typeof STATUSES[number]) || typeof raw.durationMs !== "number" || !Number.isFinite(raw.durationMs) || raw.durationMs < 0 || raw.durationMs > 1e12)) throw new Error("Invalid telemetry outcome");
  const context = {
    traceId: ctx.traceId as string, executionId: ctx.executionId as string,
    ...(ctx.spanId ? {spanId: ctx.spanId as string} : {}),
    ...(ctx.parentSpanId ? {parentSpanId: ctx.parentSpanId as string} : {}),
    ...(ctx.taskId ? {taskId: ctx.taskId as string} : {}),
    ...(ctx.agentRole ? {agentRole: ctx.agentRole as typeof AGENT_ROLES[number]} : {}),
  };
  return {
    schemaVersion: 1, sessionId: raw.sessionId as string, sequence: raw.sequence as number,
    timestamp: raw.timestamp, context, type: raw.type as TelemetryEvent["type"],
    name: raw.name as TelemetryEvent["name"], attributes: attributes(raw.attributes),
    ...(raw.type === "span.end" ? {status: raw.status as TelemetryEvent["status"], durationMs: raw.durationMs as number,
      ...(raw.name === "provider.request" ? {usage: usage(raw.usage as TelemetryEvent["usage"])} : {})} : {}),
  };
}
export async function readTelemetryJsonl(file: string, maxBytes = 16_777_216): Promise<TelemetryEvent[]> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216) throw new Error("Invalid telemetry read limit");
  const before = await inspect(file);
  if (!before || before.size > maxBytes) throw new Error("Telemetry read limit");
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  const chunks: Buffer[] = [];
  try {
    const stat = await fd.stat();
    if (!validStat(stat) || stat.ino !== before.ino || stat.dev !== before.dev) throw new Error("Unsafe telemetry input");
    let bytes = 0;
    while (true) {
      const chunk = Buffer.alloc(16_384);
      const {bytesRead} = await fd.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      bytes += bytesRead;
      if (bytes > maxBytes) throw new Error("Telemetry read limit");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const text = new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks));
    if (text && !text.endsWith("\n")) throw new Error("Truncated telemetry record");
    const lines = text ? text.slice(0, -1).split("\n") : [];
    if (lines.length > 100_000) throw new Error("Telemetry event limit");
    return lines.map(line => {
      if (Buffer.byteLength(line) > 2048) throw new Error("Telemetry record limit");
      return parseTelemetryEvent(JSON.parse(line));
    });
  } catch { throw new Error("Invalid or unreadable telemetry input"); }
  finally { await fd.close(); }
}
