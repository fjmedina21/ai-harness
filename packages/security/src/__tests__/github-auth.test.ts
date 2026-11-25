import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { GitHubAuthentication, GitHubAuthError, GitHubOAuthClient, generateGitHubPkce, githubAuthorizationUrl, receiveGitHubCode, validateGitHubAuthPolicy, type GitHubAuthPolicy, type GitHubCredentialStore, type GitHubSession } from "../github-auth.js";

const now = 1_800_000_000_000;
const policy: GitHubAuthPolicy = {
  version: 1, clientId: "Iv1.fixture", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token",
  callback: { host: "127.0.0.1", port: 53683, path: "/oauth/github/callback", timeoutMs: 1000 }, sessionMaxAgeMs: 3600000,
  allowedAccountIds: ["101", "202"], requestedPermissions: [], assignments: [
    { accountId: "101", roles: ["harness:reader", "harness:requester", "harness:operator"], resources: [{ sourceRoot: "/source", workspaceDirectory: "/private/workspaces" }] },
    { accountId: "202", roles: ["harness:reader", "harness:approver"], resources: [{ sourceRoot: "/source", workspaceDirectory: "/private/workspaces", executionIds: ["execution"], workspaceIds: ["workspace"] }] },
  ],
};
class MemoryStore implements GitHubCredentialStore {
  session: string | null = null; secret: string | null = "fixture-only-not-real"; busy = false;
  async read(name: "session" | "client-secret") { return name === "session" ? this.session : this.secret; }
  async writeSession(value: string) { this.session = value; }
  async clearSession() { this.session = null; }
  async exclusive<T>(action: () => Promise<T>): Promise<T> { if (this.busy) throw new GitHubAuthError("authentication_busy"); this.busy = true; try { return await action(); } finally { this.busy = false; } }
}
const tokens = { access_token: "ghu_fixture_token_not_real", refresh_token: "ghr_fixture_refresh_not_real", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer" };
function successfulVerification(url: string): Response {
  return Response.json(url.includes("applications/") ? { app: { client_id: policy.clientId }, user: { id: 101 } } : { type: "User", id: 101, login: "fixture" });
}
test("online App-token verification retries only transient read-only responses with one shared deadline", async () => {
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = [];
  const client = new GitHubOAuthClient(policy, (async (input, init) => {
    calls.push({ url: String(input), signal: init?.signal }); assert.equal(init?.redirect, "error");
    return calls.length < 3 ? new Response("PRIVATE SERVER MESSAGE", { status: calls.length === 1 ? 500 : 502 }) : successfulVerification(String(input));
  }) as typeof fetch, () => now);
  assert.equal((await client.identity(tokens.access_token, "fixture-only-not-real")).accountId, "101");
  assert.equal(calls.length, 4); assert.equal(calls.slice(0, 3).every(c => c.url.endsWith("/token")), true);
  assert.equal(calls[0]!.signal, calls[1]!.signal); assert.equal(calls[1]!.signal, calls[2]!.signal);
});
test("online user identity retries a transient 503 and revalidates the actual response", async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async input => { calls++; return calls === 2 ? new Response(null, { status: 503 }) : successfulVerification(String(input)); }) as typeof fetch, () => now);
  assert.equal((await client.identity(tokens.access_token, "fixture-only-not-real")).accountId, "101"); assert.equal(calls, 3);
});
test("three transient verification failures remain unavailable and never authenticate", async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async () => { calls++; return new Response("PRIVATE ERROR", { status: 504 }); }) as typeof fetch, () => now);
  await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real"), error("github_unavailable")); assert.equal(calls, 3);
});
for (const status of [401, 403, 404, 422, 429, 501]) test("verification does not retry credential, policy, rate or unsupported failures: " + status, async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async () => { calls++; return new Response("PRIVATE ERROR", { status }); }) as typeof fetch, () => now);
  await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real"), error([401, 404].includes(status) ? "credential_invalid" : "github_unavailable")); assert.equal(calls, 1);
});
for (const [name, value] of [["retry-after", "60"], ["retry-after", "invalid-private-value"], ["x-ratelimit-remaining", "0"]] as const) test("server cooldown or exhausted quota stops verification retries: " + name, async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async () => { calls++; return new Response(null, { status: 503, headers: { [name]: value } }); }) as typeof fetch, () => now);
  await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real"), error("github_unavailable")); assert.equal(calls, 1);
});
test("revocation after a transient response immediately stops verification without fallback", async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async () => { calls++; return new Response(null, { status: calls === 1 ? 500 : 404 }); }) as typeof fetch, () => now);
  await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real"), error("credential_invalid")); assert.equal(calls, 2);
});
test("transient recovery cannot silently switch the stored GitHub account", async () => {
  let calls = 0; const storage = new MemoryStore(); storage.session = JSON.stringify(session());
  const client = new GitHubOAuthClient(policy, (async input => {
    calls++; if (calls === 1) return new Response(null, { status: 500 });
    return Response.json(String(input).includes("applications/") ? { app: { client_id: policy.clientId }, user: { id: 202 } } : { type: "User", id: 202, login: "another-synthetic" });
  }) as typeof fetch, () => now);
  await assert.rejects(new GitHubAuthentication(client, storage, () => now).identity(), error("session_account_changed"));
  assert.equal(calls, 3); assert.equal(JSON.parse(storage.session!).accountId, "101");
});
test("cancellation interrupts verification backoff before any second HTTP request", async () => {
  let calls = 0; const controller = new AbortController();
  const client = new GitHubOAuthClient(policy, (async () => { calls++; setTimeout(() => controller.abort(), 10); return new Response(null, { status: 500 }); }) as typeof fetch, () => now);
  await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real", controller.signal), error("cancelled")); assert.equal(calls, 1);
});
for (const action of ["exchange", "refresh", "revoke"] as const) test("credential-mutating OAuth action is never retried: " + action, async () => {
  let calls = 0;
  const client = new GitHubOAuthClient(policy, (async () => { calls++; return new Response(null, { status: 500 }); }) as typeof fetch, () => now);
  const operation = action === "exchange" ? client.exchange("fixture-code", "fixture-verifier", "fixture-only-not-real") :
    action === "refresh" ? client.refresh(tokens.refresh_token, "fixture-only-not-real") : client.revoke(tokens.access_token, "fixture-only-not-real");
  await assert.rejects(operation, error(action === "revoke" ? "revocation_uncertain" : "github_unavailable")); assert.equal(calls, 1);
});
test("malformed successful responses and transport failures cannot trigger verification retries", async () => {
  for (const malformed of [true, false]) {
    let calls = 0;
    const client = new GitHubOAuthClient(policy, (async () => { calls++; if (malformed) return new Response("not-json", { status: 200 }); throw new TypeError("PRIVATE TLS ERROR"); }) as typeof fetch, () => now);
    await assert.rejects(client.identity(tokens.access_token, "fixture-only-not-real"), error("github_unavailable")); assert.equal(calls, 1);
  }
});
function session(id = "101"): GitHubSession {
  return { version: 1, clientId: policy.clientId, accountId: id, login: "fixture", accessToken: tokens.access_token, refreshToken: tokens.refresh_token, createdAt: now, expiresAt: now + 3600000, tokenExpiresAt: now + 28800000, refreshExpiresAt: now + 15897600000 };
}
function fixture(options: { id?: number; app?: string; status?: number; body?: unknown; policy?: GitHubAuthPolicy } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [], storage = new MemoryStore(), p = options.policy ?? policy;
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init }); assert.equal(init?.redirect, "error");
    if (init?.method === "DELETE") return new Response(null, { status: options.status ?? 204 });
    if (options.status) return new Response("{\"error\":\"PRIVATE SERVER ERROR\"}", { status: options.status });
    const data = options.body !== undefined ? options.body : url.includes("access_token") ? tokens : url.includes("memberships") ? [{ state: "active", organization: { id: 303 } }] : url.includes("applications/") ? { app: { client_id: options.app ?? p.clientId }, user: { id: options.id ?? 101 } } : { type: "User", id: options.id ?? 101, login: "fixture" };
    return Response.json(data);
  }) as typeof fetch;
  const client = new GitHubOAuthClient(p, http, () => now), auth = new GitHubAuthentication(client, storage, () => now);
  return { calls, storage, client, auth };
}
async function callbackPolicy(timeoutMs = 1000): Promise<GitHubAuthPolicy> {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve()));
  return { ...policy, callback: { ...policy.callback, port, timeoutMs } };
}
function callback(p: GitHubAuthPolicy, query: string) { return `http://127.0.0.1:${p.callback.port}${p.callback.path}?${query}`; }
const error = (code: string) => (e: unknown) => e instanceof GitHubAuthError && e.code === code;

test("authorization URL includes state, PKCE S256, exact loopback, account picker and no repo scopes", () => {
  const pkce = generateGitHubPkce(), url = new URL(githubAuthorizationUrl(policy, pkce));
  assert.equal(pkce.verifier.length, 43); assert.equal(pkce.challenge, createHash("sha256").update(pkce.verifier).digest("base64url"));
  assert.notEqual(generateGitHubPkce().state, pkce.state);
  assert.equal(url.origin, "https://github.com"); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), pkce.state); assert.equal(url.searchParams.get("scope"), "offline_access");
  assert.equal(url.searchParams.get("redirect_uri"), callback(policy, "").slice(0, -1)); assert.doesNotMatch(url.href, /client_secret|repo|access_token/);
});
for (const change of [{ authorizationEndpoint: "http://github.com/login/oauth/authorize" }, { tokenEndpoint: "https://evil.example/token" }, { callback: { ...policy.callback, host: "0.0.0.0" } }, { sessionMaxAgeMs: Infinity }, { assignments: [{ accountId: "fixture", roles: ["harness:operator"], resources: [] }] }, { allowedOrganizationIds: ["303"] }, { clientSecret: "fixture" }]) test("host policy rejects unsupported authority " + Object.keys(change)[0], () => {
  assert.throws(() => validateGitHubAuthPolicy({ ...policy, ...change }), error("invalid_host_policy"));
});
test("callback consumes one authorization code and closes loopback listener", async () => {
  const p = await callbackPolicy(), state = generateGitHubPkce().state;
  const code = await receiveGitHubCode(p, state, async () => { const response = await fetch(callback(p, `state=${state}&code=fixture-code`)); assert.equal(response.status, 200); });
  assert.equal(code, "fixture-code");
  await assert.rejects(fetch(callback(p, `state=${state}&code=replay`)));
});
test("callback state mismatch aborts before exchange", async () => {
  const p = await callbackPolicy(); await assert.rejects(receiveGitHubCode(p, "expected-state", async () => { await fetch(callback(p, "state=wrong-state&code=fixture")).catch(() => {}); }), error("invalid_state"));
});
test("callback rejects wrong path and duplicate parameters before accepting exact callback", async () => {
  const p = await callbackPolicy();
  assert.equal(await receiveGitHubCode(p, "fixture-state", async () => {
    assert.equal((await fetch(callback(p, "state=fixture-state&code=fixture").replace("/oauth/github/callback", "/oauth/github/callback/other"))).status, 400);
    assert.equal((await fetch(callback(p, "state=fixture-state&state=fixture-state&code=fixture"))).status, 400);
    assert.equal((await fetch(callback(p, "state=fixture-state&code=fixture&code=replay"))).status, 400);
    await fetch(callback(p, "state=fixture-state&code=valid"));
  }), "valid");
});
test("authorization denied requires valid state and terminates login", async () => {
  const p = await callbackPolicy(); await assert.rejects(receiveGitHubCode(p, "fixture-state", async () => { await fetch(callback(p, "state=fixture-state&error=access_denied")).catch(() => {}); }), error("authorization_denied"));
});
test("bounded timeout closes listener", async () => {
  const p = await callbackPolicy(30); await assert.rejects(receiveGitHubCode(p, "fixture", async () => {}), error("callback_timeout"));
  await assert.rejects(fetch(callback(p, "state=fixture&code=fixture")));
});
test("cancellation and concurrent loopback login reject with cleanup", async () => {
  const p = await callbackPolicy(), abort = new AbortController(); let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const first = receiveGitHubCode(p, "first", async () => started(), abort.signal);
  const rejection = assert.rejects(first, error("cancelled")); await ready;
  await assert.rejects(receiveGitHubCode(p, "second", async () => {}), error("callback_unavailable")); abort.abort(); await rejection;
});
test("exchange sends secret and verifier only in POST body, with finite response and no redirects", async () => {
  const f = fixture(); const result = await f.client.exchange("fixture-code", "fixture-verifier", f.storage.secret!);
  assert.equal(result.accessToken, tokens.access_token); const c = f.calls[0]!;
  assert.equal(c.init?.method, "POST"); assert.equal((c.init?.body as URLSearchParams).get("code_verifier"), "fixture-verifier");
  assert.doesNotMatch(c.url, /fixture-code|fixture-verifier|fixture-only/);
});
for (const status of [401, 403, 404, 500]) test("token exchange sanitized error " + status, async () => {
  const f = fixture({ status }); await assert.rejects(f.client.exchange("fixture", "fixture", f.storage.secret!), e => { assert.doesNotMatch(String(e), /PRIVATE|fixture-only/); return e instanceof GitHubAuthError; });
});
for (const body of [{ error: "bad_verification_code" }, { ...tokens, token_type: "jwt" }, { ...tokens, expires_in: 0 }, { ...tokens, refresh_token: undefined }, "x".repeat(70000)]) test("invalid/bounded token response rejected " + String(body).slice(0, 16), async () => {
  const f = fixture({ body }); await assert.rejects(f.client.exchange("fixture", "fixture", f.storage.secret!), GitHubAuthError);
});
test("verified identity uses GitHub account ID and app binding, roles are host scoped", async () => {
  const f = fixture(); f.storage.session = JSON.stringify(session()); const identity = await f.auth.identity();
  assert.equal(identity.subject, "101"); assert.equal(identity.issuer, "github.com"); assert.equal(f.calls.length, 2);
  assert.deepEqual(f.auth.roles(identity), []);
  assert.ok(f.auth.roles(identity, { sourceRoot: "/source", workspaceDirectory: "/private/workspaces" }).includes("harness:operator"));
  assert.deepEqual(f.auth.roles(identity, { sourceRoot: "/other", workspaceDirectory: "/private/workspaces" }), []);
  await assert.rejects(f.auth.authorize("harness:approver", { sourceRoot: "/source", workspaceDirectory: "/private/workspaces" }), error("forbidden_scope"));
});
test("resource-specific grants require exact execution and workspace identity", async () => {
  const f = fixture({ id: 202 }); f.storage.session = JSON.stringify(session("202")); const identity = await f.auth.identity();
  const resource = { sourceRoot: "/source", workspaceDirectory: "/private/workspaces", executionId: "execution", workspaceId: "workspace" };
  assert.ok(f.auth.roles(identity, resource).includes("harness:approver")); assert.deepEqual(f.auth.roles(identity, { ...resource, workspaceId: "other" }), []);
  const bound = f.auth.resumeVerifier(resource), challenge = { executionId: "execution", workspaceId: "workspace", action: "approve" as const, artifactDigest: "fixture-digest", challenge: "fixture-challenge" };
  const actor = await bound.verifier.verify(bound.credential, challenge); assert.deepEqual(actor.binding, challenge);
  await assert.rejects(bound.verifier.verify("forged", challenge)); await assert.rejects(bound.verifier.verify(bound.credential, { ...challenge, executionId: "other" }));
  assert.doesNotMatch(bound.credential, /ghu_|ghr_/);
});
for (const config of [{ id: 303 }, { app: "other-app" }, { body: { id: -1, login: "fixture", type: "User" } }]) test("invalid GitHub account or app identity is rejected", async () => {
  const f = fixture(config); f.storage.session = JSON.stringify(session()); await assert.rejects(f.auth.identity(), GitHubAuthError);
});
test("a different valid account cannot silently replace stored identity", async () => {
  const f = fixture({ id: 202 }); f.storage.session = JSON.stringify(session()); await assert.rejects(f.auth.identity(), error("session_account_changed"));
});
test("revoked credentials fail online verification before authorization", async () => {
  const f = fixture({ status: 401 }); f.storage.session = JSON.stringify(session()); await assert.rejects(f.auth.authorize("harness:operator", { sourceRoot: "/source", workspaceDirectory: "/private/workspaces" }), error("credential_invalid"));
});
test("missing secret, missing session, malformed session and expiration fail closed", async () => {
  const f = fixture(); await assert.rejects(f.auth.identity(), error("authentication_required"));
  for (const invalid of ["null", "{}", "not json", JSON.stringify({ ...session(), expiresAt: now - 1 }), JSON.stringify({ ...session(), createdAt: now - 7200000, expiresAt: now - 3600000 })]) { f.storage.session = invalid; await assert.rejects(f.auth.identity(), GitHubAuthError); }
  f.storage.session = JSON.stringify(session()); f.storage.secret = null; await assert.rejects(f.auth.identity(), error("missing_client_secret"));
  assert.equal(f.calls.length, 0);
});
test("refresh rotates expiring credentials, verifies original identity and keeps secrets in store", async () => {
  const f = fixture(); f.storage.session = JSON.stringify({ ...session(), tokenExpiresAt: now - 1 });
  const identity = await f.auth.refresh(); assert.equal(identity.subject, "101"); assert.equal(JSON.parse(f.storage.session!).accessToken, tokens.access_token);
  assert.doesNotMatch(JSON.stringify(identity), /ghu_|ghr_|fixture-only/);
  assert.equal((f.calls[0]!.init?.body as URLSearchParams).get("grant_type"), "refresh_token");
});
test("logout clears local storage even when remote revocation fails", async () => {
  const f = fixture({ status: 503 }); f.storage.session = JSON.stringify(session()); await assert.rejects(f.auth.logout(), error("revocation_uncertain")); assert.equal(f.storage.session, null);
});
test("login cannot overwrite existing credential or confuse concurrent attempts", async () => {
  const f = fixture(); f.storage.session = JSON.stringify(session()); await assert.rejects(f.auth.login(async () => {}), error("session_exists_logout_required"));
  f.storage.session = null; f.storage.busy = true; await assert.rejects(f.auth.login(async () => {}), error("authentication_busy")); assert.equal(f.calls.length, 0);
});
test("configured organizations require active membership with stable IDs", async () => {
  const f = fixture({ policy: { ...policy, requestedPermissions: ["organization-members:read"], allowedOrganizationIds: ["303"] } }); f.storage.session = JSON.stringify(session());
  assert.equal((await f.auth.identity()).subject, "101"); assert.equal(f.calls.length, 3);
  const denied = fixture({ policy: { ...policy, requestedPermissions: ["organization-members:read"], allowedOrganizationIds: ["999"] } }); denied.storage.session = JSON.stringify(session()); await assert.rejects(denied.auth.identity(), error("organization_not_allowed"));
});
test("full offline login exchanges callback, verifies identity, persists only via secure store", async () => {
  const p = await callbackPolicy(), f = fixture({ policy: p });
  const identity = await f.auth.login(async url => { const auth = new URL(url); await fetch(callback(p, `state=${auth.searchParams.get("state")}&code=fixture-code`)); });
  assert.equal(identity.subject, "101"); assert.equal(f.calls.length, 3); assert.ok(f.storage.session);
  assert.doesNotMatch(JSON.stringify(identity), /ghu_|ghr_|secret|verifier/);
});
test("stalled GitHub response bodies and cancellation cleanup remain bounded", async () => {
  const abort = new AbortController();
  const http = (async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }))) as typeof fetch;
  const client = new GitHubOAuthClient(policy, http), pending = client.identity(tokens.access_token, "fixture-secret", abort.signal);
  setTimeout(() => abort.abort(), 10);
  await assert.rejects(pending, GitHubAuthError);
});
test("logout cannot be blocked by a stalled revocation response body", async () => {
  const storage = new MemoryStore(); storage.session = JSON.stringify(session());
  const http = (async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 200 })) as typeof fetch;
  const auth = new GitHubAuthentication(new GitHubOAuthClient(policy, http, () => now), storage, () => now);
  await assert.rejects(auth.logout(), error("revocation_uncertain")); assert.equal(storage.session, null);
});
test("logout cleanup does not wait for an already-invalid token response body", async () => {
  const storage = new MemoryStore(); storage.session = JSON.stringify(session());
  const http = (async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 404 })) as typeof fetch;
  const auth = new GitHubAuthentication(new GitHubOAuthClient(policy, http, () => now), storage, () => now);
  await auth.logout(); assert.equal(storage.session, null);
});
test("pre-cancelled OAuth transport cannot make an HTTP request", async () => {
  let calls = 0; const http = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  const client = new GitHubOAuthClient(policy, http), abort = new AbortController(); abort.abort();
  await assert.rejects(client.identity(tokens.access_token, "fixture-secret", abort.signal)); assert.equal(calls, 0);
});
test("cancellation during credential publication clears the new session and revokes access", async () => {
  const p = await callbackPolicy(), f = fixture({ policy: p }), abort = new AbortController();
  f.storage.writeSession = async value => { f.storage.session = value; abort.abort(); };
  await assert.rejects(f.auth.login(async url => { const auth = new URL(url); await fetch(callback(p, `state=${auth.searchParams.get("state")}&code=fixture-code`)); }, abort.signal));
  assert.equal(f.storage.session, null); assert.equal(f.calls.at(-1)?.init?.method, "DELETE");
});
