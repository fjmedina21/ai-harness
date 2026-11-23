import { engineeringHash } from "./engineering-workspace.js";
import type { FileChange } from "@ai-harness/contracts";
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) throw new Error("Invalid engineering response schema");
}
/** Bounded JSON only. Host-derived result digests never grant policy authority. */
export function parseEngineeringModelOutput(text: string, implementation: boolean): {
  summary: string; proposal?: { baseRevision: string; changes: FileChange[] };
} {
  if (typeof text !== "string" || Buffer.byteLength(text) > 12_000 || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(text)) !== text) throw new Error("Engineering response limit");
  const data: unknown = JSON.parse(text);
  exact(data, implementation ? ["summary", "proposal"] : ["summary"]);
  if (typeof data.summary !== "string" || !data.summary.trim() || Buffer.byteLength(data.summary) > 2048 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data.summary)) throw new Error("Invalid engineering summary");
  if (!implementation) return { summary: data.summary };
  const draft = data.proposal; exact(draft, ["baseRevision", "changes"]);
  if (typeof draft.baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(draft.baseRevision) || !Array.isArray(draft.changes) || !draft.changes.length || draft.changes.length > 16) throw new Error("Invalid engineering proposal");
  const changes: FileChange[] = [];
  for (const item of draft.changes) {
    exact(item, ["path", "operation", "baseHash", "content", "resultHash"]);
    if (typeof item.path !== "string" || !["create", "replace", "delete"].includes(item.operation as string) ||
        !(item.baseHash === null || typeof item.baseHash === "string") || !(item.resultHash === null || typeof item.resultHash === "string") ||
        !(item.content === null || typeof item.content === "string")) throw new Error("Invalid engineering change");
    let resultHash = item.resultHash as string | null;
    if (item.operation !== "delete") {
      if (typeof item.content !== "string" || Buffer.byteLength(item.content) > 8192) throw new Error("Invalid engineering content");
      const computed = engineeringHash(item.content);
      if (resultHash !== null && resultHash !== computed) throw new Error("Incorrect model result digest");
      resultHash = computed;
    }
    changes.push({ path: item.path, operation: item.operation as FileChange["operation"], baseHash: item.baseHash as string | null,
      content: item.content as string | null, resultHash });
  }
  return { summary: data.summary, proposal: { baseRevision: draft.baseRevision, changes } };
}
