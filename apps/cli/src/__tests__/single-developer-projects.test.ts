import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { ENGINEERING_TOOL_IDS } from "@ai-harness/application";
import { normalizeApprovalPolicy } from "@ai-harness/contracts";
import { GitHubAuthentication, GitHubOAuthClient, validateGitHubAuthPolicy, type GitHubAuthPolicy } from "@ai-harness/security";
import { projectAuthorizationDigest, readGitHubHostConfiguration, type OperationalWorkspace } from "../github-host.js";
const auth: GitHubAuthPolicy = { version: 1, ownerAccountId: "101", clientId: "Iv1.single-fixture", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token", callback: { host: "127.0.0.1", port: 53688, path: "/oauth/github/callback", timeoutMs: 1000 }, requestedPermissions: [], sessionMaxAgeMs: 3600000 };
async function fixture(t: TestContext) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-project-policy-"))); await chmod(base, 0o700); t.after(() => rm(base, { recursive: true, force: true }));
  const projects: OperationalWorkspace[] = [];
  for (const id of ["alpha", "beta"]) {
    const root = path.join(base, id); await mkdir(root, { mode: 0o700 });
    for (const directory of ["source", "workspaces", "state", "checkpoints"]) await mkdir(path.join(root, directory), { mode: 0o700 });
    projects.push({ id, sourceRoot: path.join(root, "source"), workspaceDirectory: path.join(root, "workspaces"), journalFile: path.join(root, "state", "ops.sqlite"), checkpointDirectory: path.join(root, "checkpoints"),
      capabilities: ["harness:reader", "harness:requester", "harness:approver", "harness:operator"], allowedToolIds: [...ENGINEERING_TOOL_IDS], validationActions: [],
      limits: { maxIterations: 3, maxRequests: 8, maxTokens: 80000, maxEstimatedCostUsd: 0, timeoutMs: 60000, maxFiles: 4, maxBytes: 8192 },
      policy: { version: id + "-v1", allowedPaths: ["value.ts"], allowedOperations: ["replace"], maxFiles: 1, maxBytes: 4096 } });
  }
  const filename = path.join(base, "profile.json"), profile = { version: 1 as const, auth, workspaces: projects };
  const save = async (value: unknown = profile) => writeFile(filename, JSON.stringify(value), { mode: 0o600 }); await save();
  return { base, projects, profile, filename, save };
}
test("one installation registers independent canonical projects without granting global capabilities", async t => {
  const f = await fixture(t), loaded = await readGitHubHostConfiguration(f.filename); assert.equal(loaded.workspaces.length, 2);
  assert.notEqual(projectAuthorizationDigest(loaded.workspaces[0]!), projectAuthorizationDigest(loaded.workspaces[1]!));
  const credentials = { read: async () => null, writeSession: async () => {}, clearSession: async () => {}, exclusive: async <T>(run: () => Promise<T>) => run() };
  const identity = { issuer: "github.com" as const, subject: "101", login: "synthetic", expiresAt: Date.now() + 60000 };
  const authentication = new GitHubAuthentication(new GitHubOAuthClient(auth), credentials);
  assert.deepEqual(authentication.roles(identity, f.projects[0]!), []);

});
for (const change of ["unregistered-path", "duplicate-project", "shared-workspace", "shared-source", "source-home", "traversal", "symlink", "global-tool", "invalid-budget", "invalid-policy", "unknown-operation", "unsupported-profile", "no-policy", "no-capabilities"] as const)
test("project registry fails closed: " + change, async t => {
  const f = await fixture(t), p = f.projects[1]!;
  if (change === "unregistered-path") p.sourceRoot = path.join(f.base, "absent");
  if (change === "duplicate-project") p.id = f.projects[0]!.id;
  if (change === "shared-workspace") p.workspaceDirectory = f.projects[0]!.workspaceDirectory;
  if (change === "shared-source") p.sourceRoot = f.projects[0]!.sourceRoot;
  if (change === "source-home") p.sourceRoot = homedir();
  if (change === "traversal") p.policy.allowedPaths = ["../escape"];
  if (change === "symlink") { const alias = path.join(f.base, "alias"); await symlink(p.sourceRoot, alias); p.sourceRoot = alias; }
  if (change === "global-tool") p.allowedToolIds = ["*"];
  if (change === "invalid-budget") p.limits.maxRequests = 100000;
  if (change === "invalid-policy") p.policy.maxBytes = 65536;
  if (change === "unknown-operation") p.policy.allowedOperations = ["chmod" as never];
  if (change === "unsupported-profile") p.validationActions = [{ id: "privileged" } as never];
  if (change === "no-policy") delete (p as Partial<OperationalWorkspace>).policy;
  if (change === "no-capabilities") delete (p as Partial<OperationalWorkspace>).capabilities;
  await f.save(); await assert.rejects(readGitHubHostConfiguration(f.filename));
});
test("OAuth rejects old lists, account assignments, multiple owners and a second current identity", async t => {
  for (const value of [{ ...auth, ownerAccountId: ["101", "202"] }, { ...auth, allowedAccountIds: ["101"] }, { ...auth, assignments: [] }, { ...auth, owners: ["101", "202"] }]) assert.throws(() => validateGitHubAuthPolicy(value));
  const f = await fixture(t), resource = { sourceRoot: f.projects[0]!.sourceRoot, workspaceDirectory: f.projects[0]!.workspaceDirectory };
  const credentials = { read: async () => null, writeSession: async () => {}, clearSession: async () => {}, exclusive: async <T>(run: () => Promise<T>) => run() };
  const authentication = new GitHubAuthentication(new GitHubOAuthClient(auth), credentials, Date.now, [{ ...resource, capabilities: ["harness:reader"] }]);
  const owner = { issuer: "github.com" as const, subject: "101", login: "fixture", expiresAt: Date.now() + 60000 };
  assert.deepEqual(authentication.roles(owner, resource), ["harness:reader"]);
  assert.deepEqual(authentication.roles(owner, f.projects[1]!), []);
  assert.deepEqual(authentication.roles({ ...owner, subject: "202" }, resource), []);
  assert.deepEqual(authentication.roles({ ...owner, expiresAt: Date.now() - 1 }, resource), []);
});
test("the full resource fingerprint changes for roots, limits, file policy, tools, project id and profiles", async t => {
  const f = await fixture(t), original = f.projects[0]!, digest = projectAuthorizationDigest(original);
  for (const patch of [{ id: "renamed" }, { sourceRoot: f.projects[1]!.sourceRoot }, { workspaceDirectory: f.projects[1]!.workspaceDirectory },
    { policy: { ...original.policy, version: "v2" } }, { limits: { ...original.limits, maxRequests: 1 } }, { allowedToolIds: ["diff.inspect"] }, { capabilities: ["harness:reader" as const] }])
    assert.notEqual(projectAuthorizationDigest({ ...original, ...patch }), digest);
  assert.equal(projectAuthorizationDigest({ ...original, approval: normalizeApprovalPolicy() }), digest);
});
