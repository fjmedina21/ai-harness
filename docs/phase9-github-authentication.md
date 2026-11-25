# Phase 9A.3 — GitHub authentication

Version **0.8.0**, experimental. GitHub is the only developer identity provider.
The single-owner refactor is offline verified and its actual owner login, native
Personal and durable Podman scope were separately authorized and verified. Refresh/
logout history remains evidence for its earlier revision, not a new observation. AI model providers remain
independent: logging in never authorizes a paid model call.

## Architecture and trust boundary

```text
CLI → GitHub App OAuth + PKCE → app-token check + GET /user
    → protected local session → separate host project capabilities
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

Online identity checks tolerate only transient HTTP 500/502/503/504 responses:
at most three attempts with 250/500 ms backoffs, sharing the original 10-second
deadline per endpoint (including HTTP, body reads and backoff). This applies only
to the fixed read-only App-token check, `/user` and configured organization
membership reads. GitHub documents the POST endpoint as
[checking token validity](https://docs.github.com/en/rest/apps/oauth-applications#check-a-token);
it does not mint or reset a credential. Both App binding and stable user identity
must still verify successfully. There is no cached-identity fallback.

Credential/policy/rate-limit rejections, malformed responses, transport errors and
other statuses are not retried. A `Retry-After` header or exhausted rate quota
stops the invocation; it does not schedule another attempt. OAuth code exchange,
refresh and revocation are single-attempt operations. Cancellation interrupts the
backoff. Exhausted verification remains blocked as `github_unavailable` (or
`authentication_unavailable` through the approval broker), without changing the
local credential or issuing a decision. No uncertain operation is replayed.

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
matching the host's single `ownerAccountId` is accepted. Tokens are OAuth credentials, not
OIDC identity JWTs; no arbitrary token claims are trusted. The app check and user
endpoint are documented by [GitHub](https://docs.github.com/en/rest/apps/oauth-applications#check-a-token)
and [the users API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).

Canonical identity is `{ issuer: "github.com", subject: "NUMERIC_ACCOUNT_ID" }`.
Username is display metadata. A different GitHub ID is rejected even with a valid
OAuth token. Old account lists and identity assignments are invalid configuration.
Authentication returns owner identity and session expiry, not resource permissions.

Project capabilities are supplied separately from OAuth policy and default to an
empty set. The host checks canonical project/source/workspace and optional exact
execution/workspace scope, then the existing functional capability identifiers:

| Capability | Host lifecycle |
| --- | --- |
| `harness:reader` | status, diff |
| `harness:requester` | request a project-authorized isolated proposal |
| `harness:approver` | request native human review; reject/revoke |
| `harness:operator` | continue; request separately approved validation |

No capability is implicitly granted by login. Optional stable organization
membership restrictions only narrow identity acceptance. They grant no capability.
The sole Personal protocol then requires exact review, typed `APPROVE` and fresh
native authentication; it is neither login nor a role assignment. See
[project policy](project-authorization.md) and [Personal L2](phase9-personal-mode.md).

The macOS adapter stores the App secret and session in Keychain, outside the
project. Access/refresh tokens never enter argv, project files, SQLite, artifacts,
checkpoints or telemetry. Secret writes use bounded stdin rather than process
arguments. The `GitHubCredentialStore` contract supports future reviewed native
adapters; Linux/Windows have no supplied operational adapter and fail closed.
Actual login and Keychain session recovery across CLI processes, refresh and
logout were observed in the explicitly authorized local tests. Native Personal
approval/continuation also passed separately; these observations are scoped to
the tested macOS host and synthetic workspace.

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

Identity output includes username, stable account ID, expiration and whether it
matches the installation owner. It contains no token. Commands also accept `--json`; credential flags
are rejected. Configuration and owner registration are described in
[GitHub App setup](phase9-github-app-setup.md); authenticated continuation is in
[Operational L2](phase9-operational-l2.md).

Gate A **passed for the explicitly tested local lifecycle**: actual GitHub login,
native protected session recovery, online identity, refresh and logout were observed,
including the authorized official fresh login/logout smoke. Its final logout left
the local session cleared; grant-wide remote refresh-token revocation is unverified.
Mocks establish protocol behavior, not broader OS credential isolation. See
[verification](VERIFICATION.md#phase-9a3-and-phase-9b).

Run deterministic coverage with `pnpm test:github-auth`. The separate
`pnpm smoke:github-auth --authorize-live-github-oauth` is owner-operated and must
not be run automatically or in CI. The owner explicitly authorized the successful
live run recorded in the report; this does not authorize another attempt.
