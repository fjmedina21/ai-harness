import { engineeringHash } from "@ai-harness/tools";
import type { EngineeringAgentInput, EngineeringAgentPort } from "./engineering.js";
/** Deterministic host-authored replacement recipe. Does not interpret requests as code. */
export class FixtureEngineeringAgent implements EngineeringAgentPort {
  readonly id = "fixture";
  readonly mode = "fixture";
  readonly maxTokensPerRequest = 1;
  readonly maxEstimatedCostUsdPerRequest = 0;
  constructor(private readonly target: string, private readonly content: string) {}
  async execute(input: EngineeringAgentInput) {
    input.signal.throwIfAborted();
    if (input.role !== "backend-developer") return { summary: "Review the host-supplied fixture replacement within its explicit path scope", usage: { tokens: 0, estimatedCostUsd: 0 } };
    const existing = input.snapshot.files.find(f => f.path === this.target);
    return { summary: "Propose the explicit offline fixture replacement", usage: { tokens: 0, estimatedCostUsd: 0 }, proposal: {
      baseRevision: input.snapshot.digest, changes: [{ path: this.target, operation: existing ? "replace" : "create", baseHash: existing?.hash ?? null,
        content: this.content, resultHash: engineeringHash(this.content) }] } };
  }
}
