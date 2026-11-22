import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TelemetrySession, InMemoryTelemetrySink, JsonlTelemetrySink, readTelemetryJsonl, buildExecutionMetrics, buildExecutionTrace } from "../index.js";
import type { TelemetryEvent } from "@ai-harness/contracts";

function fixture() { const sink = new InMemoryTelemetrySink(); const session = new TelemetrySession({sink, now:()=>new Date("2026-01-01T00:00:00.000Z"), monotonicNow:(()=>{let n=0;return()=>n+=5;})()}); const root=session.trace("execution-1"); const span=session.startSpan(root,"execution"); span.end({status:"ok"}); return {sink,session}; }
test("memory sink strips unknown fields and bounds serialized records",()=>{const sink=new InMemoryTelemetrySink(2);const event={schemaVersion:1,sessionId:"s",sequence:1,timestamp:"2026-01-01T00:00:00.000Z",context:{traceId:"t",executionId:"e",spanId:"sp"},type:"span.end",name:"execution",attributes:{},status:"ok",durationMs:1,apiKey:"secret"} as unknown as TelemetryEvent;sink.write(event);assert.equal(JSON.stringify(sink.events()).includes("secret"),false);assert.throws(()=>sink.write({...event,status:"not-a-status"} as unknown as TelemetryEvent));assert.equal(sink.rejected,1);});
test("session reports trace metrics without duplicate authorization identity",async()=>{const {sink,session}=fixture();await session.flush();const events=sink.events();assert.equal(buildExecutionTrace(events,"execution-1").incomplete,false);assert.equal(buildExecutionMetrics(events,"execution-1").complete,true);assert.deepEqual(Object.keys(events[0]!.attributes),[]);});
test("JSONL private sink rotates and reads bounded validated events",async()=>{const directory=await mkdtemp(path.join(tmpdir(),"harness-telemetry-"));try{await chmod(directory,0o700);const sink=new JsonlTelemetrySink({directory,maxFileBytes:1024,maxFiles:2});const {sink:memory,session}=fixture();await session.flush();for(const event of memory.events()) await sink.write(event);const events=await readTelemetryJsonl(path.join(directory,"telemetry.jsonl"));assert.equal(events.length,memory.events().length);assert.equal((await stat(path.join(directory,"telemetry.jsonl"))).mode&0o077,0);}finally{await rm(directory,{recursive:true,force:true});}});
