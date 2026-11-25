import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as backoff } from "node:timers/promises";
import type { HostIdentity, ResumeIdentityChallenge, ResumeIdentityVerifier, VerifiedResumeIdentity } from "@ai-harness/contracts";

export class GitHubAuthError extends Error {
  constructor(readonly code: string) { super("GitHub authentication rejected: " + code); this.name = "GitHubAuthError"; }
}
function deny(code: string): never { throw new GitHubAuthError(code); }
export const GITHUB_ISSUER = "github.com";
export const HARNESS_ROLES = ["harness:reader", "harness:requester", "harness:approver", "harness:operator"] as const;
export type HarnessRole = typeof HARNESS_ROLES[number];
export interface GitHubResourceScope {
  sourceRoot: string;
  workspaceDirectory: string;
  executionIds?: readonly string[];
  workspaceIds?: readonly string[];
}
/** Host-owned project capabilities, independent of OAuth identity. No implicit owner privileges. */
export interface HostProjectCapabilities extends GitHubResourceScope {
  capabilities: readonly HarnessRole[];
}
export interface GitHubAuthPolicy {
  version: 1;
  clientId: string;
  authorizationEndpoint: "https://github.com/login/oauth/authorize";
  tokenEndpoint: "https://github.com/login/oauth/access_token";
  callback: { host: "127.0.0.1"; port: number; path: "/oauth/github/callback"; timeoutMs: number };
  sessionMaxAgeMs: number;
  ownerAccountId: string;
  allowedOrganizationIds?: readonly string[];
  requestedPermissions: readonly ("organization-members:read")[];
}
export interface GitHubSession {
  version: 1; clientId: string; accountId: string; login: string;
  accessToken: string; refreshToken?: string; refreshExpiresAt?: number;
  createdAt: number; expiresAt: number; tokenExpiresAt: number;
}
/** Implementations are host capabilities, never repository/model-selected. */
export interface GitHubCredentialStore {
  read(name: "session" | "client-secret"): Promise<string | null>;
  writeSession(value: string): Promise<void>;
  clearSession(): Promise<void>;
  exclusive<T>(action: () => Promise<T>): Promise<T>;
}
export interface GitHubIdentity extends HostIdentity {
  issuer: typeof GITHUB_ISSUER; subject: string; login: string; expiresAt: number;
}
const account = (v: unknown): v is string => typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v);
const bounded = (n: unknown, max: number) => Number.isSafeInteger(n) && (n as number) > 0 && (n as number) <= max;
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).every(k => keys.includes(k));
export function validateGitHubAuthPolicy(input: unknown): GitHubAuthPolicy {
  const p = input as GitHubAuthPolicy;
  if (!p || typeof p !== "object" || Array.isArray(p) || !exactKeys(p, ["version", "clientId", "authorizationEndpoint", "tokenEndpoint", "callback", "sessionMaxAgeMs", "ownerAccountId", "allowedOrganizationIds", "requestedPermissions"]) ||
    p.version !== 1 || typeof p.clientId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(p.clientId) ||
    p.authorizationEndpoint !== "https://github.com/login/oauth/authorize" || p.tokenEndpoint !== "https://github.com/login/oauth/access_token" ||
    !p.callback || !exactKeys(p.callback, ["host", "port", "path", "timeoutMs"]) || p.callback.host !== "127.0.0.1" || p.callback.path !== "/oauth/github/callback" ||
    !bounded(p.callback.port, 65535) || p.callback.port < 1024 || !bounded(p.callback.timeoutMs, 300000) ||
    !bounded(p.sessionMaxAgeMs, 28800000) || !account(p.ownerAccountId) ||
    !Array.isArray(p.requestedPermissions) || p.requestedPermissions.some(x => x !== "organization-members:read") ||
    (p.allowedOrganizationIds !== undefined && (!Array.isArray(p.allowedOrganizationIds) || p.allowedOrganizationIds.length > 32 || !p.allowedOrganizationIds.every(account))) ||
    (p.allowedOrganizationIds?.length && !p.requestedPermissions.includes("organization-members:read"))) deny("invalid_host_policy");
  return structuredClone(p);
}

export function generateGitHubPkce(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { state: randomBytes(32).toString("base64url"), verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export function githubAuthorizationUrl(policy: GitHubAuthPolicy, pkce: ReturnType<typeof generateGitHubPkce>): string {
  const p = validateGitHubAuthPolicy(policy), url = new URL(p.authorizationEndpoint);
  for (const [key, value] of Object.entries({ client_id: p.clientId, redirect_uri: callbackUri(p), state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: "S256", allow_signup: "false", prompt: "select_account", scope: "offline_access" })) url.searchParams.set(key, value);
  return url.href;
}
const callbackUri = (p: GitHubAuthPolicy) => `http://${p.callback.host}:${p.callback.port}${p.callback.path}`;

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted(); let abort!: () => void;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { abort = () => reject(new GitHubAuthError("github_unavailable")); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); })]);
  } finally { if (abort) signal.removeEventListener("abort", abort); }
}

/** Exact fixed loopback binding serializes competing CLI logins on this host/port. */
export async function receiveGitHubCode(policy: GitHubAuthPolicy, state: string, ready: () => Promise<void>, signal?: AbortSignal): Promise<string> {
  const p = validateGitHubAuthPolicy(policy);
  signal?.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    let consumed = false, settled = false;
    const server = createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Security-Policy", "default-src 'none'"); res.setHeader("Connection", "close");
      const bad = () => { res.writeHead(400); res.end("Authorization rejected."); };
      if (settled || consumed) { bad(); return; }
      if (req.method !== "GET" || req.headers.host !== `${p.callback.host}:${p.callback.port}` || !req.url || req.url.length > 4096 || !req.url.startsWith(p.callback.path + "?") || req.url.includes("#")) { bad(); return; }
      const url = new URL(req.url, callbackUri(p));
      if (url.pathname !== p.callback.path || url.origin !== new URL(callbackUri(p)).origin ||
        url.searchParams.getAll("state").length !== 1) { bad(); return; }
      const received = Buffer.from(url.searchParams.get("state")!), expected = Buffer.from(state);
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) { bad(); finish(new GitHubAuthError("invalid_state")); return; }
      if (url.searchParams.has("error")) { bad(); finish(new GitHubAuthError("authorization_denied")); return; }
      if (url.searchParams.getAll("code").length !== 1) { bad(); return; }
      const code = url.searchParams.get("code")!;
      if (!/^[A-Za-z0-9._-]{1,512}$/.test(code)) { bad(); finish(new GitHubAuthError("invalid_code")); return; }
      consumed = true; res.writeHead(200, { "Content-Type": "text/plain" }); res.end("Authorization received. Return to AI Harness.", () => finish(undefined, code));
    });
    server.maxConnections = 8; server.requestTimeout = 3000; server.headersTimeout = 3000;
    const timer = setTimeout(() => finish(new GitHubAuthError("callback_timeout")), p.callback.timeoutMs);
    const aborted = () => finish(new GitHubAuthError("cancelled"));
    const finish = (error?: Error, code?: string) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", aborted);
      server.close(); server.closeAllConnections(); error ? reject(error) : resolve(code!);
    };
    signal?.addEventListener("abort", aborted, { once: true });
    server.once("error", () => finish(new GitHubAuthError("callback_unavailable")));
    server.listen(p.callback.port, p.callback.host, () => { if (!settled) void ready().catch(() => finish(new GitHubAuthError("browser_unavailable"))); });
    if (signal?.aborted) aborted();
  });
}

/** GitHub-only transport: fixed HTTPS origins, no redirects, finite bodies/time. */
export class GitHubOAuthClient {
  readonly policy: GitHubAuthPolicy;
  constructor(policy: GitHubAuthPolicy, private readonly http: typeof fetch = fetch, private readonly now: () => number = Date.now) { this.policy = validateGitHubAuthPolicy(policy); }
  private async request(url: string, init: RequestInit, signal?: AbortSignal, verification = false): Promise<any> {
    const parsed = new URL(url);
    if (!["https://api.github.com", "https://github.com"].includes(parsed.origin) || parsed.username || parsed.password || parsed.hash) deny("invalid_endpoint");
    const timeout = AbortSignal.timeout(10000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    // GitHub's POST check-token endpoint is read-only. Never replay code exchange,
    // refresh, revoke, or a caller-selected endpoint when verification is unavailable.
    const readOnlyVerification = verification && parsed.origin === "https://api.github.com" && (
      init.method === "POST" && parsed.pathname === `/applications/${this.policy.clientId}/token` ||
      (init.method === undefined || init.method === "GET") && ["/user", "/user/memberships/orgs"].includes(parsed.pathname));
    try {
      for (let attempt = 0; attempt < (readOnlyVerification ? 3 : 1); attempt++) {
        combined.throwIfAborted();
        const response = await abortable(this.http(url, { ...init, redirect: "error", signal: combined, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...init.headers } }), combined);
        if (!response.ok || !response.body) {
          void response.body?.cancel().catch(() => {});
          if (readOnlyVerification && attempt < 2 && [500, 502, 503, 504].includes(response.status) &&
            !response.headers.has("retry-after") && response.headers.get("x-ratelimit-remaining") !== "0") {
            // One deadline covers HTTP, body reads and both bounded backoffs. A
            // server cooldown/limit stops this invocation instead of scheduling a retry.
            await backoff(250 * 2 ** attempt, undefined, { signal: combined });
            continue;
          }
          deny(response.status === 401 || response.status === 404 ? "credential_invalid" : "github_unavailable");
        }
        const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
        try { while (true) { combined.throwIfAborted(); const { done, value } = await abortable(reader.read(), combined); if (done) break; size += value.byteLength; if (size > 65536) deny("response_limit"); chunks.push(value); } }
        finally { void reader.cancel().catch(() => {}); }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      }
      deny("github_unavailable");
    } catch (e) { if (e instanceof GitHubAuthError) throw e; return deny(signal?.aborted ? "cancelled" : "github_unavailable"); }
  }
  private basic(secret: string) {
    if (!secret || secret.length > 4096 || /[\r\n\0]/.test(secret)) deny("missing_client_secret");
    return "Basic " + Buffer.from(this.policy.clientId + ":" + secret).toString("base64");
  }
  private parseTokens(data: any): { accessToken: string; refreshToken: string; tokenExpiresAt: number; refreshExpiresAt: number } {
    if (!data || data.error || data.token_type !== "bearer" || !/^ghu_[A-Za-z0-9_]{8,512}$/.test(data.access_token ?? "") ||
      !/^ghr_[A-Za-z0-9_]{8,512}$/.test(data.refresh_token ?? "") || !bounded(data.expires_in, 28800) || !bounded(data.refresh_token_expires_in, 15897600)) deny("token_exchange_rejected");
    return { accessToken: data.access_token, refreshToken: data.refresh_token, tokenExpiresAt: this.now() + data.expires_in * 1000, refreshExpiresAt: this.now() + data.refresh_token_expires_in * 1000 };
  }
  async exchange(code: string, verifier: string, secret: string, signal?: AbortSignal) {
    this.basic(secret);
    const data = await this.request(this.policy.tokenEndpoint, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.policy.clientId, client_secret: secret, code, code_verifier: verifier, redirect_uri: callbackUri(this.policy) }) }, signal);
    return this.parseTokens(data);
  }
  async refresh(refreshToken: string, secret: string, signal?: AbortSignal) {
    this.basic(secret);
    const data = await this.request(this.policy.tokenEndpoint, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.policy.clientId, client_secret: secret, grant_type: "refresh_token", refresh_token: refreshToken }) }, signal);
    return this.parseTokens(data);
  }
  async identity(token: string, secret: string, signal?: AbortSignal): Promise<{ accountId: string; login: string }> {
    if (!/^ghu_[A-Za-z0-9_]{8,512}$/.test(token)) deny("credential_invalid");
    // App-bound validation plus independently fetched user identity; tokens are not JWTs.
    const checked = await this.request(`https://api.github.com/applications/${this.policy.clientId}/token`, { method: "POST", headers: { Authorization: this.basic(secret), "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) }, signal, true);
    const user = await this.request("https://api.github.com/user", { headers: { Authorization: "Bearer " + token } }, signal, true);
    if (!user || user.type !== "User" || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(user.login) ||
      checked?.app?.client_id !== this.policy.clientId || checked?.user?.id !== user.id) deny("invalid_identity");
    const accountId = String(user.id);
    if (accountId !== this.policy.ownerAccountId) deny("account_not_allowed");
    if (this.policy.allowedOrganizationIds?.length) {
      let allowed = false;
      for (let page = 1; page <= 5 && !allowed; page++) {
        const memberships = await this.request(`https://api.github.com/user/memberships/orgs?per_page=100&page=${page}`, { headers: { Authorization: "Bearer " + token } }, signal, true);
        if (!Array.isArray(memberships) || memberships.length > 100) deny("invalid_identity");
        allowed = memberships.some((m: any) => m?.state === "active" && Number.isSafeInteger(m.organization?.id) && this.policy.allowedOrganizationIds!.includes(String(m.organization.id)));
        if (memberships.length < 100) break;
      }
      if (!allowed) deny("organization_not_allowed");
    }
    return { accountId, login: user.login };
  }
  async revoke(token: string, secret: string, signal?: AbortSignal): Promise<void> {
    // DELETE token revokes this credential; grant-wide logout is deliberately avoided.
    const url = `https://api.github.com/applications/${this.policy.clientId}/token`;
    const timeout = AbortSignal.timeout(10000);
    try {
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      combined.throwIfAborted();
      const response = await abortable(this.http(url, { method: "DELETE", headers: { Authorization: this.basic(secret), Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }), redirect: "error", signal: combined }), combined);
      if (response.status !== 204 && response.status !== 404) deny("revocation_uncertain");
      void response.body?.cancel().catch(() => {});
    } catch { deny("revocation_uncertain"); }
  }
}

export class GitHubAuthentication {
  readonly policy: GitHubAuthPolicy;
  private readonly projects: readonly HostProjectCapabilities[];
  constructor(private readonly client: GitHubOAuthClient, private readonly credentials: GitHubCredentialStore, private readonly now: () => number = Date.now, projects: readonly HostProjectCapabilities[] = []) {
    this.policy = Object.freeze(validateGitHubAuthPolicy(client.policy));
    this.projects = structuredClone(projects);
    for (const project of this.projects) {
      if (!project || !exactKeys(project, ["sourceRoot", "workspaceDirectory", "executionIds", "workspaceIds", "capabilities"]) ||
        ![project.sourceRoot, project.workspaceDirectory].every(v => typeof v === "string" && v.startsWith("/") && v !== "/" && v.length <= 4096 && !v.includes("\0") && !v.split("/").some(c => c === "." || c === "..")) ||
        !Array.isArray(project.capabilities) || project.capabilities.some(c => !HARNESS_ROLES.includes(c)) ||
        [project.executionIds, project.workspaceIds].some(ids => ids !== undefined && (!Array.isArray(ids) || ids.length > 256 || !ids.every(id => /^[A-Za-z0-9-]{1,80}$/.test(id))))) deny("invalid_project_capabilities");
    }
  }
  private async secret(): Promise<string> { const secret = await this.credentials.read("client-secret"); if (!secret) deny("missing_client_secret"); return secret; }
  private async session(): Promise<GitHubSession> {
    const raw = await this.credentials.read("session"); if (!raw || raw.length > 16384) deny("authentication_required");
    let s: GitHubSession; try { s = JSON.parse(raw); } catch { return deny("invalid_session"); }
    if (!s || typeof s !== "object" || !exactKeys(s, ["version", "clientId", "accountId", "login", "accessToken", "refreshToken", "refreshExpiresAt", "createdAt", "expiresAt", "tokenExpiresAt"]) || s.version !== 1 || s.clientId !== this.policy.clientId || !account(s.accountId) || !Number.isSafeInteger(s.createdAt) || !Number.isSafeInteger(s.expiresAt) || !Number.isSafeInteger(s.tokenExpiresAt) ||
      s.createdAt > this.now() || s.expiresAt <= s.createdAt || s.expiresAt > s.createdAt + 28800000 || !/^ghu_[A-Za-z0-9_]{8,512}$/.test(s.accessToken)) deny("invalid_session");
    if (s.accountId !== this.policy.ownerAccountId) deny("account_not_allowed");
    return s;
  }
  private alive(s: GitHubSession) { if (Math.min(s.expiresAt, s.createdAt + this.policy.sessionMaxAgeMs, s.tokenExpiresAt) <= this.now()) deny("session_expired"); }
  async login(openBrowser: (url: string) => Promise<void>, signal?: AbortSignal): Promise<GitHubIdentity> {
    return this.credentials.exclusive(async () => {
      if (await this.credentials.read("session")) deny("session_exists_logout_required");
      const secret = await this.secret(), pkce = generateGitHubPkce();
      const code = await receiveGitHubCode(this.policy, pkce.state, () => openBrowser(githubAuthorizationUrl(this.policy, pkce)), signal);
      const tokens = await this.client.exchange(code, pkce.verifier, secret, signal);
      let publicationAttempted = false;
      try {
        const identity = await this.client.identity(tokens.accessToken, secret, signal), now = this.now();
        const session: GitHubSession = { version: 1, clientId: this.policy.clientId, ...identity, ...tokens, createdAt: now, expiresAt: Math.min(now + this.policy.sessionMaxAgeMs, tokens.tokenExpiresAt) };
        signal?.throwIfAborted(); publicationAttempted = true; await this.credentials.writeSession(JSON.stringify(session)); signal?.throwIfAborted();
        return { issuer: GITHUB_ISSUER, subject: identity.accountId, login: identity.login, expiresAt: session.expiresAt };
      } catch (e) { if (publicationAttempted) await this.credentials.clearSession().catch(() => {}); await this.client.revoke(tokens.accessToken, secret).catch(() => {}); throw e; }
    });
  }
  async identity(signal?: AbortSignal): Promise<GitHubIdentity> {
    const session = await this.session(); this.alive(session);
    const verified = await this.client.identity(session.accessToken, await this.secret(), signal);
    if (verified.accountId !== session.accountId) deny("session_account_changed");
    this.alive(session);
    return { issuer: GITHUB_ISSUER, subject: verified.accountId, login: verified.login, expiresAt: Math.min(session.expiresAt, session.createdAt + this.policy.sessionMaxAgeMs, session.tokenExpiresAt) };
  }
  async refresh(signal?: AbortSignal): Promise<GitHubIdentity> {
    return this.credentials.exclusive(async () => {
      const s = await this.session(), secret = await this.secret();
      if (!s.refreshToken || !Number.isSafeInteger(s.refreshExpiresAt) || s.refreshExpiresAt! <= this.now()) deny("session_expired");
      const tokens = await this.client.refresh(s.refreshToken, secret, signal);
      try {
        const identity = await this.client.identity(tokens.accessToken, secret, signal);
        if (identity.accountId !== s.accountId) deny("session_account_changed");
        const now = this.now(), updated = { ...s, ...tokens, login: identity.login, createdAt: now, expiresAt: Math.min(now + this.policy.sessionMaxAgeMs, tokens.tokenExpiresAt) };
        signal?.throwIfAborted(); await this.credentials.writeSession(JSON.stringify(updated)); signal?.throwIfAborted();
        return { issuer: GITHUB_ISSUER, subject: identity.accountId, login: identity.login, expiresAt: updated.expiresAt };
      } catch (e) { await this.client.revoke(tokens.accessToken, secret).catch(() => {}); await this.credentials.clearSession(); throw e; }
    });
  }
  async logout(signal?: AbortSignal): Promise<void> {
    return this.credentials.exclusive(async () => {
      let failure: unknown;
      try { const s = await this.session(); await this.client.revoke(s.accessToken, await this.secret(), signal); }
      catch (e) { if (!(e instanceof GitHubAuthError && e.code === "authentication_required")) failure = e; }
      finally { await this.credentials.clearSession(); }
      if (failure) deny("revocation_uncertain");
    });
  }
  roles(identity: GitHubIdentity, resource?: GitHubResourceScope & { executionId?: string; workspaceId?: string }): HarnessRole[] {
    if (identity.issuer !== GITHUB_ISSUER || identity.subject !== this.policy.ownerAccountId || identity.expiresAt <= this.now()) return [];
    return [...new Set(this.projects.filter(r => resource && r.sourceRoot === resource.sourceRoot && r.workspaceDirectory === resource.workspaceDirectory &&
      (!r.executionIds || !!resource.executionId && r.executionIds.includes(resource.executionId)) && (!r.workspaceIds || !!resource.workspaceId && r.workspaceIds.includes(resource.workspaceId))).flatMap(r => [...r.capabilities]))];
  }
  async authorize(role: HarnessRole, resource: GitHubResourceScope & { executionId?: string; workspaceId?: string }, signal?: AbortSignal): Promise<GitHubIdentity> {
    const identity = await this.identity(signal); if (!this.roles(identity, resource).includes(role)) deny("forbidden_scope"); return identity;
  }
  resumeVerifier(resource: GitHubResourceScope & { executionId: string; workspaceId: string }, signal?: AbortSignal): { credential: string; verifier: ResumeIdentityVerifier } {
    // An ephemeral host handle, never a token, serialized credential, or argv parameter.
    const credential = randomBytes(32).toString("hex");
    return { credential, verifier: { verify: async (handle: string, challenge: Readonly<ResumeIdentityChallenge>): Promise<VerifiedResumeIdentity> => {
      if (handle !== credential || challenge.executionId !== resource.executionId || challenge.workspaceId !== resource.workspaceId) deny("forbidden_scope");
      const identity = await this.identity(signal);
      return { issuer: GITHUB_ISSUER, subject: identity.subject, roles: this.roles(identity, resource), binding: structuredClone(challenge), expiresAt: Math.min(identity.expiresAt, this.now() + 60000) };
    } } };
  }
}
