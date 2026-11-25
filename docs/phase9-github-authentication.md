# Phase 9A.3 — GitHub authentication

Version **0.8.0**, experimental. GitHub is the only developer identity provider.
The implementation and mocked-HTTP verification are separate from the pending
owner-authorized live GitHub/Keychain acceptance gate. AI model providers remain
independent: logging in never authorizes a paid model call.

## Architecture and trust boundary

```text
CLI → GitHub App OAuth + PKCE → app-token check + GET /user
    → protected local session → scoped host role policy
    → ApprovalBroker → DurableApprovalService → ContinuationCoordinator
```

`packages/security/src/github-auth.ts` owns the GitHub client, protocol, session
service and resource-scoped verifier. `apps/cli/src/github-host.ts` loads private
host configuration, supplies the macOS credential adapter and opens the browser.
The model and project configuration receive neither interface nor credential.

The supported endpoints are fixed to `https://github.com/login/oauth/authorize`,
`https://github.com/login/oauth/access_token` and `https://api.github.com`.
Custom identity providers, GitHub Enterprise Server endpoint substitution, device
flow fallback and arbitrary token environment variables are unsupported.

## Authorization Code + PKCE

Login generates independent cryptographically random state and verifier with
Node's crypto library. The S256 challenge is SHA-256/base64url. A bounded listener
binds only `127.0.0.1` on the configured unprivileged fixed port, accepts the exact
`/oauth/github/callback` GET path/Host, rejects duplicate code/state values and
compares state before exchanging the code. Each callback is consumed once.
Cancellation, timeout, browser failure and listener conflict close the listener.
An exclusive host lock serializes login, refresh and logout across CLI processes;
the fixed callback port also rejects concurrent listeners. No wildcard bind exists.

The browser URL includes temporary OAuth state/challenge and the registered
callback. The code, verifier and client secret are exchanged in a POST body.
Transport uses HTTPS, rejects redirects, caps response bodies at 64 KiB and uses
finite request deadlines. Provider error text is never echoed to the terminal.

GitHub's current GitHub App web flow supports S256 and requires the App client
secret in addition to PKCE. This implementation intentionally refuses token
responses without an expiring access token and refresh token. The App must have
compatible expiring user tokens; `offline_access` requests that behavior. GitHub
App permissions are set at registration, not by repository OAuth scopes. See
[GitHub's user-token flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

## Identity, sessions and roles

Each online identity check validates the credential against
`POST /applications/{client_id}/token`, verifies the returned App client ID, then
compares the returned user ID with `GET /user`. Only a valid GitHub `User` account
in the host's numeric-ID allowlist is accepted. Tokens are OAuth credentials, not
OIDC identity JWTs; no arbitrary token claims are trusted. The app check and user
endpoint are documented by [GitHub](https://docs.github.com/en/rest/apps/oauth-applications#check-a-token)
and [the users API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).

Canonical identity is `{ issuer: "github.com", subject: "NUMERIC_ACCOUNT_ID" }`.
Username is display metadata. A second browser session or renamed username does
not create an independent approver. Roles come only from the current trusted host
assignments, with exact source/workspace roots and optional execution/workspace IDs:

| Role | Allowed lifecycle |
| --- | --- |
| `harness:reader` | status, diff |
| `harness:requester` | create an authorized isolated proposal |
| `harness:approver` | approve, reject, revoke |
| `harness:operator` | continue; future separately approved validation |

No role is implicitly granted by login. Optional organization restrictions require
explicit configured stable organization IDs and active online membership; they
do not grant roles. They additionally require reviewed organization Members read
permission. The default identity-only setup requests no repository write access.

The macOS adapter stores the App secret and session in Keychain, outside the
project. Access/refresh tokens never enter argv, project files, SQLite, artifacts,
checkpoints or telemetry. Secret writes use bounded stdin rather than process
arguments. The `GitHubCredentialStore` contract supports future reviewed native
adapters; Linux/Windows have no supplied operational adapter and fail closed.
Native Keychain behavior remains a live acceptance requirement.

Equivalent adapter designs, **not implemented**, are Linux Secret Service using
an unlocked native user collection and Windows Credential Manager using OS-user
protected credentials/DPAPI-backed storage. Each must implement the same App-scoped
store and exclusive operation contract, use captured native IPC/stdin rather than
secret argv, deny access when locked/unavailable, and provide no plaintext fallback.
Native access control, concurrent mutation, logout/refresh and failure tests plus
security review are required before either platform is enabled. This design does
not claim operational Linux/Windows support.

Session expiration is capped by token expiration and host policy (at most eight
hours). `auth refresh` rotates credentials and re-verifies the same stable ID;
refresh does not silently switch account. Login refuses to overwrite an existing
session: logout first. Logout requests deletion of the current token and clears
local credentials even when remote revocation is uncertain, reporting the failure.
It does not establish remote refresh-token revocation, especially when an expired
access token produces 404. CLI output explicitly separates the access credential
as `revoked_or_invalid` from the refresh credential as
`removed_locally_remote_revocation_unverified`. To invalidate every credential in
an incident, revoke the App authorization in GitHub's authorized Apps settings.
Online checks before lifecycle actions detect invalid/revoked credentials and
policy changes. No grant-wide logout guarantee is claimed.

## CLI and acceptance

```sh
pnpm harness auth login
pnpm harness auth whoami
pnpm harness auth status
pnpm harness auth refresh
pnpm harness auth logout
```

Identity output includes username, stable account ID, expiration and scoped host
assignments. It contains no token. Commands also accept `--json`; credential flags
are rejected. Configuration and owner registration are described in
[GitHub App setup](phase9-github-app-setup.md); authenticated continuation is in
[Operational L2](phase9-operational-l2.md).

Gate A is **offline verified, live pending** until an explicitly authorized smoke
confirms actual GitHub login, native protected storage, online verification,
refresh/revocation and output review. Mocks establish protocol behavior, not
deployed GitHub interoperability or OS credential isolation. See
[verification](VERIFICATION.md#phase-9a3-and-phase-9b).

Run deterministic coverage with `pnpm test:github-auth`. The separate
`pnpm smoke:github-auth --authorize-live-github-oauth` is owner-operated and must
not be run automatically or in CI. No opt-in smoke has been executed in this work.
