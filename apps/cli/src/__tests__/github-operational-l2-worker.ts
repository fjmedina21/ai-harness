/** Test-only subprocess composition. All HTTP and credentials are synthetic. */
import path from "node:path";
import { GitHubAuthentication, GitHubOAuthClient, type GitHubAuthPolicy, type GitHubCredentialStore, type GitHubSession, type HarnessRole } from "@ai-harness/security";
import type { EngineeringPolicy } from "@ai-harness/contracts";
import { engineeringCommand, engineeringLifecycleCommand } from "../engineering-cli.js";
import type { GitHubHost } from "../github-host.js";

const [base, action, executionId = "", actor = "101", scenario = "valid"] = process.argv.slice(2);
if (!base || !action) throw new Error("Missing synthetic worker arguments");
const sourceRoot = path.join(base, "source"), workspaceDirectory = path.join(base, "workspaces");
const policy: EngineeringPolicy = { version: "cli-openai-v1", allowedPaths: ["value.ts"], allowedOperations: ["create", "replace"], maxFiles: 16, maxBytes: 8192 };
const roles: Record<string, HarnessRole[]> = {
  "101": ["harness:requester", "harness:reader", "harness:approver"],
  "202": ["harness:reader", "harness:approver"],
  "303": ["harness:reader", "harness:operator"],
  "404": ["harness:reader"],
};
const authPolicy: GitHubAuthPolicy = {
  version: 1, clientId: "Iv1.synthetic-test-app", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token",
  callback: { host: "127.0.0.1", port: 49191, path: "/oauth/github/callback", timeoutMs: 1000 }, sessionMaxAgeMs: 3600000,
  allowedAccountIds: Object.keys(roles), requestedPermissions: [],
  assignments: Object.entries(roles).map(([accountId, assigned]) => ({ accountId, roles: assigned,
    resources: [{ sourceRoot, workspaceDirectory, ...(scenario === "wrong_workspace" ? { workspaceIds: ["different-workspace"] } : {}) }] })),
};
const now = Date.now(), login = scenario === "renamed_session" ? "another-display-name" : "synthetic-" + actor;
const session: GitHubSession = { version: 1, clientId: authPolicy.clientId, accountId: actor, login,
  accessToken: "ghu_synthetic_test_only_" + actor, createdAt: now - 1000, expiresAt: now + 3600000, tokenExpiresAt: now + 3600000 };
class MemoryCredentials implements GitHubCredentialStore {
  private raw: string | null = scenario === "missing_session" ? null : JSON.stringify(session);
  async read(name: "session" | "client-secret") { return name === "client-secret" ? "synthetic-app-secret-never-real" : this.raw; }
  async writeSession(value: string) { this.raw = value; }
  async clearSession() { this.raw = null; }
  async exclusive<T>(f: () => Promise<T>): Promise<T> { return f(); }
}
let providerCalls = 0, githubCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://api.openai.com/v1/responses") {
    providerCalls++;
    if (action !== "generate") throw new Error("Provider forbidden during lifecycle continuation");
    const body = JSON.parse(String(init?.body)), request = JSON.parse(body.input);
    if (body.model !== "fixture-model" || body.store !== false || String(init?.body).includes("ghu_synthetic")) throw new Error("Invalid synthetic provider request");
    const output = { summary: "Synthetic advisory only", ...(request.role === "backend-developer" ? { proposal: {
      baseRevision: request.snapshot.digest, changes: [{ path: "value.ts", operation: "replace", baseHash: request.snapshot.files[0].hash, content: "export const value = 2;\n", resultHash: null }],
    } } : {}) };
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }], usage: { input_tokens: 100, output_tokens: 20 } });
  }
  githubCalls++;
  if (init?.redirect !== "error") throw new Error("Synthetic GitHub requests must deny redirects");
  if (scenario === "revoked") return Response.json({ message: "Synthetic revoked credential" }, { status: 401 });
  const id = scenario === "wrong_account" ? 999 : Number(actor);
  if (url === `https://api.github.com/applications/${authPolicy.clientId}/token` && init?.method === "POST") return Response.json({ app: { client_id: authPolicy.clientId }, user: { id } });
  if (url === "https://api.github.com/user") return Response.json({ type: "User", id, login });
  throw new Error("Unexpected synthetic endpoint; real network is disabled");
};
const host: GitHubHost = { configuration: { version: 1, auth: authPolicy, workspaces: [{ sourceRoot, workspaceDirectory,
  journalFile: path.join(base, "state", "ops.sqlite"), checkpointDirectory: path.join(base, "checkpoints"), policy }] },
  authentication: new GitHubAuthentication(new GitHubOAuthClient(authPolicy), new MemoryCredentials()) };
const output: string[] = [];
try {
  const code = action === "generate" ? await engineeringCommand([
    "--workflow", "implement", "--path", sourceRoot, "--request", "Replace the selected constant from one to two", "--provider", "openai", "--model", "fixture-model", "--autonomy", "isolated", "--files", "value.ts",
    "--max-provider-requests", "6", "--max-output-tokens", "512", "--confirm-provider-call", "--allow-uncertain-cost", "--authorize-workspace", "--workspace-dir", workspaceDirectory,
    "--journal", path.join(base, "state", "ops.sqlite"), "--checkpoint-dir", path.join(base, "checkpoints"), "--json",
  ], sourceRoot, text => output.push(text), undefined, async () => host) :
    await engineeringLifecycleCommand([action, "--id", executionId, "--json"], text => output.push(text), undefined, async () => host);
  process.send?.({ code, result: JSON.parse(output.join("")), providerCalls, githubCalls, pid: process.pid });
} catch { process.send?.({ code: 1, result: { error: { code: "synthetic_worker_failed" } }, providerCalls, githubCalls, pid: process.pid }); }
finally { process.disconnect?.(); }
