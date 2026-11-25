# Operational Personal L2

Version **0.8.0**. One installation owner is authenticated online using GitHub App
OAuth + PKCE and macOS Keychain. Host project capabilities authorize resources;
human-confirmed Personal L2 authorizes an exact modification. No other identity
can approve or continue the owner's operation.

1. Register the project manually in the trusted private host profile, with exact
   source/workspace roots, policies, tools and limits. No registry entry means deny.
2. Request an isolated proposal using the existing `run --workflow implement`
   interface and bounded provider options. It stops at pending durable approval.
3. Inspect `engineering status --id ID` and `engineering diff --id ID`.
4. Run `engineering approve --id ID`; review the exact diff, type `APPROVE` and
   complete the native macOS authentication dialog. There is no bypass flag.
5. Run `engineering continue --id ID` in a new process. The broker re-verifies
   owner/capability, project fingerprint and artifact, then reconciles source,
   workspace, snapshot, patch and policy before CAS/fenced grant consumption.
6. Review the private workspace. Original-project integration is not implemented.

`reject` and `revoke` are owner/capability checked and durable. Expired or changed
operations need a fresh request, never a modified identity or expiry. Old Team
records are audit-only. [Migration](single-developer-migration.md) explains the
explicit incompatibility for old artifacts without project resource fingerprints.

Current owner-authorized actual Personal and Podman evidence is recorded for the
synthetic local scope, including a fresh complete CLI case with separate native
patch/sandbox decisions. Other project/profile scope remains blocked until its
own exact acceptance. The private domain-HMAC acceptance is tied to current owner,
project/code/runtime and all required durable results, with expiry. No provider is
called on continuation. See [Personal](phase9-personal-mode.md),
[actual report](phase9-real-acceptance-report.md) and [verification](VERIFICATION.md).
