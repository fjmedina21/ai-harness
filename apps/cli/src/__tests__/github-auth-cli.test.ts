import assert from "node:assert/strict";
import test from "node:test";
import { chmod, link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { normalizeApprovalPolicy } from "@ai-harness/contracts";
import path from "node:path";
import { GitHubAuthentication, GitHubAuthError, GitHubOAuthClient, type GitHubAuthPolicy, type GitHubCredentialStore } from "@ai-harness/security";
import { authCommand, githubKeychainService, readGitHubHostConfiguration, type GitHubHost } from "../github-host.js";
import { githubAuthSmoke } from "../github-auth-smoke.js";

const policy: GitHubAuthPolicy = { version: 1, clientId: "Iv1.synthetic", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token", callback: { host: "127.0.0.1", port: 53684, path: "/oauth/github/callback", timeoutMs: 1000 }, sessionMaxAgeMs: 3600000, requestedPermissions: [], allowedAccountIds: ["101"], assignments: [{ accountId: "101", roles: ["harness:reader"], resources: [] }] };
function host(): GitHubHost {
  const now = Date.now();
  const credentials: GitHubCredentialStore = { read: async name => name === "client-secret" ? "synthetic-only-secret" : JSON.stringify({ version: 1, clientId: policy.clientId, accountId: "101", login: "synthetic", accessToken: "ghu_synthetic_test_only", createdAt: now - 1000, expiresAt: now + 3600000, tokenExpiresAt: now + 3600000 }), writeSession: async () => {}, clearSession: async () => {}, exclusive: async f => f() };
  const http = (async input => String(input).includes("applications/") ? Response.json({ app: { client_id: policy.clientId }, user: { id: 101 } }) : Response.json({ type: "User", id: 101, login: "synthetic" })) as typeof fetch;
  return { configuration: { version: 1, auth: policy, workspaces: [] }, authentication: new GitHubAuthentication(new GitHubOAuthClient(policy, http), credentials) };
}
for (const command of ["whoami", "status"]) test("auth " + command + " returns verified metadata without secrets", async () => {
  const output: string[] = []; assert.equal(await authCommand([command], text => output.push(text), undefined, async () => host()), 0);
  const result = JSON.parse(output.join("")); assert.equal(result.authenticated, true); assert.equal(result.accountId, "101"); assert.equal(result.username, "synthetic"); assert.ok(result.expiresAt);
  assert.deepEqual(result.assignments[0].roles, ["harness:reader"]); assert.doesNotMatch(output.join(""), /ghu_|synthetic-only-secret/);
});
for (const args of [["login", "--token", "PRIVATE_TOKEN"], ["whoami", "--username", "operator"], ["status", "--json", "--json"], ["logout", "--credential", "PRIVATE_CREDENTIAL"]]) test("auth rejects authority argv " + args[1], async () => {
  const output: string[] = []; let loaded = false;
  assert.equal(await authCommand(args, text => output.push(text), undefined, async () => { loaded = true; return host(); }), 1);
  assert.equal(loaded, false); assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments"); assert.doesNotMatch(output.join(""), /PRIVATE/);
});
test("missing configuration fails closed and live smoke requires explicit consent", async () => {
  const output: string[] = [];
  assert.equal(await authCommand(["status"], text => output.push(text), undefined, async () => { throw new GitHubAuthError("authentication_required"); }), 1);
  assert.equal(await githubAuthSmoke([], text => output.push(text)), 2); assert.match(output.join(""), /blocked/);
  assert.notEqual(githubKeychainService("one-app"), githubKeychainService("another-app"));
});
test("CLI reports unavailable verification without suggesting a credential replacement", async () => {
  const output: string[] = [];
  assert.equal(await authCommand(["status"], text => output.push(text), undefined, async () => { throw new GitHubAuthError("github_unavailable"); }), 1);
  const result = JSON.parse(output.join("")); assert.equal(result.authenticated, false); assert.equal(result.error.code, "github_unavailable");
  assert.match(result.error.message, /verification unavailable/); assert.doesNotMatch(result.error.message, /configuration|credential|token/);
});
for (const mode of ["valid", "file-mode", "directory-mode", "symlink", "hardlink", "fifo", "unknown-key", "oversized", "bad-json"] as const) test("host configuration private filesystem validation " + mode, async t => {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-auth-profile-"))); await chmod(base, 0o700); t.after(() => rm(base, { recursive: true, force: true }));
  const directory = path.join(base, "private"); await mkdir(directory, { mode: 0o700 }); const filename = path.join(directory, "github-auth.json");
  const profile = { version: 1, auth: policy, workspaces: [] };
  await writeFile(filename, mode === "bad-json" ? "PRIVATE INVALID JSON" : mode === "oversized" ? "x".repeat(65537) : JSON.stringify(mode === "unknown-key" ? { ...profile, token: "PRIVATE_TOKEN" } : profile), { mode: 0o600 });
  let selected = filename;
  if (mode === "file-mode") await chmod(filename, 0o644);
  if (mode === "directory-mode") await chmod(directory, 0o755);
  if (mode === "symlink") { selected = path.join(directory, "alias.json"); await symlink(filename, selected); }
  if (mode === "hardlink") await link(filename, path.join(directory, "alias.json"));
  if (mode === "fifo") { selected = path.join(directory, "fifo.json"); execFileSync("/usr/bin/mkfifo", [selected]); }
  if (mode === "valid") assert.deepEqual(await readGitHubHostConfiguration(filename), profile);
  else await assert.rejects(readGitHubHostConfiguration(selected), e => { assert.doesNotMatch(String(e), /PRIVATE/); return e instanceof GitHubAuthError; });
});
for (const mode of ["personal", "team", "invalid", "contradictory"] as const) test("host approval configuration is explicit and strict: " + mode, async t => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "harness-mode-"))); await chmod(directory, 0o700); t.after(() => rm(directory, { recursive: true, force: true }));
  const approval = { ...normalizeApprovalPolicy(), ...(mode === "team" ? {} : { mode: "personal", allowRequesterApproval: true }), ...(mode === "invalid" ? { skipReview: true } : mode === "contradictory" ? { requireHumanConfirmation: false } : {}) };
  const filename = path.join(directory, "profile.json"); await writeFile(filename, JSON.stringify({ version: 1, auth: policy, workspaces: [], approval }), { mode: 0o600 });
  if (mode === "invalid" || mode === "contradictory") await assert.rejects(readGitHubHostConfiguration(filename));
  else { const loaded = await readGitHubHostConfiguration(filename); assert.equal(loaded.approval!.mode, mode); assert.deepEqual(loaded.auth.assignments[0]!.roles, ["harness:reader"]); }
});
