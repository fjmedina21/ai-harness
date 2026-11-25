# GitHub App setup for a local AI Harness host

This procedure requires the owner's interaction. The implementation never creates
or modifies a GitHub App automatically. Version remains **0.8.0**; a configured
App does not establish live acceptance or authorize provider/Podman workloads.

## Register the App

1. In GitHub settings, open **Developer settings → GitHub Apps → New GitHub App**.
   Choose the intended owner and an owner-controlled application name/homepage.
2. Register the exact callback, for example
   `http://127.0.0.1:53682/oauth/github/callback`. Select the same host, port and
   path in the local policy. Disable callback wildcard matching where offered.
   Use a fixed free unprivileged port; the CLI does not fall back to another port.
3. Enable compatible expiring user access tokens. No device-flow fallback is
   implemented. The CLI requests `offline_access` with PKCE S256.
4. For identity alone, request no repository permissions, write permissions,
   organization access or private email access. `GET /user` supports GitHub App
   user tokens without additional permission. If an organization allowlist is
   explicitly required, separately review/configure Members read permission.
5. Do not request user authorization during installation as a substitute for the
   CLI's own state/PKCE transaction. Webhooks are not needed for this local flow;
   revocation is rechecked online before privileged operations.
6. Copy the **Client ID**, not the numeric App ID. Generate a client secret and
   place it directly into protected credential storage. Never paste it into the
   repository, `.ai`, a command argument or a terminal transcript.

These choices follow the current [GitHub App user-token flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
and [App registration guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).
PKCE supplements the required client secret; it does not turn this GitHub App
web flow into a secret-free native application or an OIDC flow. Use a separately
reviewed broker design if distributing a shared confidential client is required.

## Protected local configuration

The CLI reads only `~/.config/ai-harness/github-auth.json`, owned by the current OS
user, regular/single-link and mode `0600`, in a canonical private `0700` directory.
It does not load authentication from project `.env`, `.ai` or arbitrary environment
variables. All roots below must be actual canonical absolute paths. Private
workspace, checkpoint and journal parent directories must already exist at `0700`
outside the source project. Do not store this profile in Git.

This identity-only fixture example is a schema illustration. Replace IDs, paths
and Client ID with independently verified host values. Do not use placeholder
identities for real authorization:

```json
{
  "version": 1,
  "auth": {
    "version": 1,
    "clientId": "REPLACE_WITH_GITHUB_APP_CLIENT_ID",
    "authorizationEndpoint": "https://github.com/login/oauth/authorize",
    "tokenEndpoint": "https://github.com/login/oauth/access_token",
    "callback": {
      "host": "127.0.0.1",
      "port": 53682,
      "path": "/oauth/github/callback",
      "timeoutMs": 180000
    },
    "sessionMaxAgeMs": 3600000,
    "allowedAccountIds": ["101", "202"],
    "requestedPermissions": [],
    "assignments": [
      {
        "accountId": "101",
        "roles": ["harness:reader", "harness:requester", "harness:operator"],
        "resources": [{"sourceRoot": "/ABSOLUTE/SYNTHETIC/PROJECT", "workspaceDirectory": "/PRIVATE/workspaces"}]
      },
      {
        "accountId": "202",
        "roles": ["harness:reader", "harness:approver"],
        "resources": [{"sourceRoot": "/ABSOLUTE/SYNTHETIC/PROJECT", "workspaceDirectory": "/PRIVATE/workspaces"}]
      }
    ]
  },
  "workspaces": [{
    "sourceRoot": "/ABSOLUTE/SYNTHETIC/PROJECT",
    "workspaceDirectory": "/PRIVATE/workspaces",
    "journalFile": "/PRIVATE/state/operations.sqlite",
    "checkpointDirectory": "/PRIVATE/checkpoints",
    "policy": {
      "version": "cli-fixture-v1",
      "allowedPaths": ["value.ts"],
      "allowedOperations": ["create", "replace"],
      "maxFiles": 1,
      "maxBytes": 8192
    }
  }]
}
```

Optional resource `executionIds` and `workspaceIds` narrow an assignment further;
IDs are exact and case-sensitive. Such restricted grants cannot authorize a new
request before its IDs exist. The fixture policy above matches only the fixture
CLI example. OpenAI isolated requests must match `cli-openai-v1`, explicit allowed
paths/operations, `maxFiles: 16` and `maxBytes: 8192`. Mismatch fails closed; project
configuration cannot add permissions. Model credentials remain independently
configured and explicitly billable; authentication never supplies them.

## macOS Keychain provisioning

The Keychain service name is
`ai-harness.github.` plus the first 32 lowercase hex characters of SHA-256 of the
App Client ID. `githubKeychainService(clientId)` exposes the same deterministic
non-secret calculation. Use **Keychain Access → New Password Item** in the login
keychain: set the service/item name to that value, Account to `client-secret`,
and Password to the App client secret. Do not use `security ... -w SECRET` in a
shell command. Grant access only to the intended reviewed application/process.

The CLI manages a second `session` account under that service. Its base64url value
is merely an encoding inside Keychain, not encryption for a project file. Never
copy it to local JSON or diagnostics. Access/refresh tokens live only in protected
storage and bounded process memory. Keychain prompts/access denial fail closed.
Linux/Windows require a reviewed native credential adapter before operational use.

## Owner-authorized smoke and troubleshooting

Only after explicit owner authorization, run
`pnpm smoke:github-auth --authorize-live-github-oauth`. Without that explicit flag
the smoke returns blocked (exit 2); the script performs login, whoami and logout.
Also complete the [authentication smoke](phase9-github-authentication.md#cli-and-acceptance)
on a synthetic workspace: login, inspect whoami/status, restart the CLI, verify
the same stable ID, exercise refresh, logout, and confirm a revoked/absent session
cannot authorize lifecycle actions. Review terminal output and private durable
files for absence of credentials. Do not perform this smoke in CI.

Logout clears the local session and attempts access-token deletion, but does not
prove remote refresh-token revocation. In an incident, revoke the App authorization
in GitHub's authorized Apps settings; inspect the CLI's separate access/refresh
credential status fields rather than interpreting logout as grant-wide invalidation.

| Error | Host action |
| --- | --- |
| `authentication_required` | Check fixed private profile and existing protected session |
| `invalid_host_configuration` / `invalid_host_policy` | Check exact schema, canonical roots, ownership/modes, permissions and policy equality |
| `missing_client_secret` | Provision the correct Keychain service/account using the GUI |
| `callback_unavailable` / `authentication_busy` | Inspect competing login or port owner; after a crash inspect stale `github-auth.lock` before any manual removal |
| `callback_timeout` / `authorization_denied` | Start a new login after resolving user authorization; codes are never reused |
| `session_exists_logout_required` | Logout before switching accounts; a new login cannot silently replace a token |
| `session_expired` | Explicitly refresh when eligible, otherwise logout/login |
| `credential_invalid` / `session_account_changed` | Stop; inspect revocation, App binding and selected GitHub account |
| `forbidden_scope` / `organization_not_allowed` | Review numeric-ID assignments and exact current resource; do not widen automatically |
| `revocation_uncertain` | Local session is cleared; inspect GitHub authorized Apps and revoke there if necessary |

Do not extend an existing approval's expiry to compensate for login time. In Team
Mode, establish the second identity's session before generating the proposal; the
existing durable approval defaults to 60 seconds. Explicit Personal policy instead
requires one scoped four-role account and a fresh human decision; see
[Personal Mode](phase9-personal-mode.md) and [Operational L2](phase9-operational-l2.md).
