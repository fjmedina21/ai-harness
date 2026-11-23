# Phase 9 workspaces

Implemented: `EngineeringWorkspace` in tools. Private copies are chosen over Git
worktrees; the original Git metadata, hooks, configuration and source writes are
never exposed. The host explicitly selects relative files and a separate canonical
0700 workspace parent. No automatic project discovery/copy, dependency installation,
Git operations or repository-selected workspace root occurs.

Each execution has one exclusive UUID directory, a 0600 receipt and a 0700 `files/`
root. Receipt fields include execution/workspace identity, source root, content-based
base revision, UID and expiry. Revision means the digest of sorted paths/content
hashes/byte sizes, not a claim that the source is an atomic Git revision. Copies
are bounded to 256 files / 4 MiB, at most 1 MiB per read. Host configuration can
lower bounds. Only regular, single-link, non-executable UTF-8 text is supported;
reserved/hidden paths, dependencies and common key files are rejected. Selection
is case-fold collision checked. Arbitrary binary/executable repos are unsupported.

Directory creation is journaled before effects. File contents use exclusive,
no-follow opens and fsync. Ownership/canonical root/inode checks and full manifest
rehashing protect ordinary replacement/conflict cases. These are portable Node
checks, not openat2-style atomic rooted confinement; malicious same-UID host races
and atomic source-tree snapshots are outside the supported boundary. File fsync
plus SQLite does not establish power-loss ordering across all directories.

A persistent exclusive `mutation.lock` serializes mutations. Failed/incomplete
mutations preserve the lock and uncertainty evidence. Expiry denies subsequent
mutations; it never silently removes review evidence. Process restart does not
reuse the receipt as execution authority. `inspectEngineeringRecovery()` compares
the exact creation journal digest, receipt, private roots, actual inventory, locks
and operation states; it returns inspection-only or blocked, always retryAllowed=false.

`cleanupEngineeringWorkspace()` is an explicit exact-snapshot host lifecycle API,
not a model tool. It rejects missing authorization, changed snapshots, pending or
uncertain operations, locks, links and unexpected metadata. It uses the same
exclusive mutation lock, verified per-file unlink and empty-directory rmdir, never
recursive rm. Its effect is journaled and a failure is Uncertain. No automatic
retention deletion or multi-user workspace sharing is enabled. A trusted host must
review retained evidence, fence workers and reconcile before any new authorization.
