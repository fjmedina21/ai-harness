# GitHub identity, project authorization and human approval

## Authentication

GitHub App OAuth + PKCE and online verification establish the configured numeric owner. macOS Keychain protects session secrets. Usernames, model claims and repository settings are not identity proof. The product has no operational multiuser/team approval path.

## Authorization

A private host registry assigns project capabilities, canonical roots, file/operation scope, allowed tools, validation actions and finite limits. Login grants none of these. The complete project fingerprint binds new proposals to current policy; changed policy fails closed.

## Personal human intent

The owner reviews the exact diff, artifact/snapshot/policy/challenge and expiry, types `APPROVE` and completes fresh native LocalAuthentication. HumanApprovalAuthority creates an in-process receipt through its trusted verifier. A verifier interface or synthetic test verifier is not a deployed identity/presence system.

![Exact Personal L2 review followed by one-time fenced isolated apply.](/diagrams/personal.svg)

## Single-use grants and execution approval

The broker records expiring scoped grants, revocation and one-time intent IDs in SQLite. CAS, leases and fencing remain authoritative at consumption. A patch grant never authorizes validation. Sandbox review binds the resulting snapshot, image, fixed action/profile, resource/output/time limits and a fresh challenge; a new native confirmation is mandatory.

No `--auto-approve`, `--yes`, approval self-grant or automatic replay is supported. Historical grants are audit records, not current authority.

## Source and evidence

[docs/phase9-personal-mode.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-personal-mode.md), [docs/project-authorization.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/project-authorization.md), [packages/security/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/security/src/index.ts), [apps/cli/src/human-approval.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/human-approval.ts).
