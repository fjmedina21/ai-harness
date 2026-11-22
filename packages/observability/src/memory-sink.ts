import type { TelemetryEvent, TelemetrySink } from "@ai-harness/contracts";
import { parseTelemetryEvent } from "./jsonl-sink.js";
/** Fixed-capacity ring: retained events bounded; evictions are explicit. */
export class InMemoryTelemetrySink implements TelemetrySink {
  private readonly ring: Readonly<TelemetryEvent>[] = [];
  private cursor = 0;
  evicted = 0;
  rejected = 0;
  constructor(readonly capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000) throw new Error("Invalid memory sink capacity");
  }
  write(event: Readonly<TelemetryEvent>): void {
    let copy: TelemetryEvent;
    try {
      copy = parseTelemetryEvent(event);
      if (Buffer.byteLength(JSON.stringify(copy), "utf8") > 2048) throw new Error("Telemetry record limit");
    } catch {
      this.rejected++;
      throw new Error("Invalid telemetry event");
    }
    if (this.ring.length < this.capacity) this.ring.push(copy);
    else { this.ring[this.cursor] = copy; this.cursor = (this.cursor + 1) % this.capacity; this.evicted++; }
  }
  events(): TelemetryEvent[] {
    return structuredClone(this.ring.length < this.capacity ? this.ring : [...this.ring.slice(this.cursor), ...this.ring.slice(0, this.cursor)]);
  }
}
