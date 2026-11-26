# Manual single-developer migration and rollback

> **Status clarification (Phase 9D):** This runbook describes the v3 single-owner migration. Phase 9C separately installs opt-in repair schema v4; no automatic approval conversion is introduced. See [current architecture](ARCHITECTURE.md), [verification](VERIFICATION.md) and [repair acceptance](phase9c-e2e.md).


This release keeps application version **0.8.0** and SQLite Journal **v3**.
It does not rewrite the owner's private configuration, Keychain or real journal.
The previous multi-account profile is rejected, including a single-element
`allowedAccountIds`, `assignments`, unknown owner lists and any Team approval
policy. One exact numeric `auth.ownerAccountId` is required. Usernames are not IDs.

1. Stop every journal/session user. Preserve private, consistent backups of the
   complete host profile, SQLite database, proposal artifacts and host HMAC key,
   checkpoints and validation evidence. Verify backup bytes/inventory and private
   permissions before editing. Do not copy a live SQLite file as a consistency claim.
2. Independently verify the intended numeric owner. Preserve the existing Client ID,
   endpoints, callback, requested permissions, optional organization restriction
   and expiration settings. Replace account lists with `ownerAccountId`; remove
   identity assignments. Do not alter an existing operation/requester identity.
3. For each authorized project, manually add a unique `id`, explicit project
   `capabilities`, `allowedToolIds`, `limits` and `validationActions`. Preserve
   existing narrower path/operation/size policies. Use `validationActions: []`
   until sandbox actions are explicitly authorized. Review every canonical path;
   never replace a real profile wholesale with the documentation example.
4. Remove Team approval policies. Personal is the sole default and only accepted
   policy; if retained explicitly, use the exact six-field Personal object in
   [Personal L2](phase9-personal-mode.md). Approval is still human-confirmed.
5. Validate the file with `readGitHubHostConfiguration` offline before online login.
   Retain mode 0600 and parent 0700. Verify the session belongs to this owner;
   an old different-account session fails closed and is never rebound automatically.
6. New proposals are required for old operational artifacts lacking the complete
   project fingerprint. The CLI reports `policy_changed`; old grants are not
   migrated, extended, consumed or reactivated. Historical reviewed Personal
   records remain readable and retain their original digests and intent ledger.

No new database schema is required. Existing transactional v1/v2-to-v3 admission,
SQLITE_FULL rollback and recovery remain covered. The archival decoder accepts
historical Team records only for inspection; new decisions, leases and effect
consumption require current Personal context and the same requester/owner. It is
not a compatibility execution mode. Do not drop tables, lower user_version, edit
checksums or restore consumed confirmations to pending.

Rollback requires the verified consistent backup and explicit reconciliation of
any later side effects. New fingerprint-bearing artifacts are incompatible with
older binaries and fail their strict admission. Restoring old binaries/profile
alone is not a safe downgrade. Keep a separate read-only historical backup and
create fresh approvals after reconciliation; never replay uncertain operations.
