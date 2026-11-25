/** TEST ONLY: mocked GitHub HTTP and external human-intent verifier; never real presence evidence. */
import { GitHubAuthentication, GitHubOAuthClient, HumanApprovalAuthority, type GitHubAuthPolicy, type GitHubCredentialStore } from "@ai-harness/security";
import { normalizeApprovalPolicy, type ApprovalPolicy, type HumanApprovalPort, type HostIdentity } from "@ai-harness/contracts";
export const personal: ApprovalPolicy = { ...normalizeApprovalPolicy(), mode: "personal", allowRequesterApproval: true };
export const owner: HostIdentity = { issuer: "github.com", subject: "70000001" };
export const confirmation: HumanApprovalPort = new HumanApprovalAuthority({ method: "reviewed-external-v1", verify: async () => true });
export function authentication(sourceRoot: string, workspaceDirectory: string, actorId = owner.subject, scenario = "valid") {
  const policy: GitHubAuthPolicy = { version: 1, clientId: "Iv1.personal-fixture", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token",
    callback: { host: "127.0.0.1", port: 53689, path: "/oauth/github/callback", timeoutMs: 1000 }, sessionMaxAgeMs: 3600000, ownerAccountId: owner.subject, requestedPermissions: [] };
  const now = Date.now();
  const credentials: GitHubCredentialStore = { read: async name => name === "client-secret" ? "fixture-only-not-real" : JSON.stringify({ version: 1, clientId: policy.clientId, accountId: actorId, login: "synthetic", accessToken: "ghu_synthetic_personal_only", createdAt: now - 1000, expiresAt: scenario === "expired" ? now - 1 : now + 3600000, tokenExpiresAt: now + 3600000 }), writeSession: async () => {}, clearSession: async () => {}, exclusive: async f => f() };
  let calls = 0;
  const http = (async input => { calls++; if (scenario === "revoked") return Response.json({}, { status: 401 });
    const id = scenario === "wrong_account" ? 999 : Number(actorId);
    return String(input).includes("applications/") ? Response.json({ app: { client_id: policy.clientId }, user: { id } }) : Response.json({ id, login: "synthetic", type: "User" }); }) as typeof fetch;
  const auth = new GitHubAuthentication(new GitHubOAuthClient(policy, http), credentials, Date.now, [{ sourceRoot, workspaceDirectory, capabilities: scenario === "roles" ? ["harness:reader"] : ["harness:reader", "harness:requester", "harness:approver", "harness:operator"] }]);
  return { auth, calls: () => calls };
}
