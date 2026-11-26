# Personal L2 and isolated workspace

Personal is the only operational approval protocol. The authenticated requester and approver must be the same numeric installation owner. This permits single-developer review while preserving a real human gate.

![Personal L2 sequence: reconcile, display exact diff, type APPROVE, native authentication, scoped grant and fenced apply.](/diagrams/personal.svg)

## Exact approval

```sh
pnpm harness engineering status --id EXECUTION_ID
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

Approval reopens the authenticated artifact and current host policy, reconciles source/workspace, displays the exact action, requires the exact text `APPROVE` and fresh native macOS LocalAuthentication. Identity and policy are rechecked after review. A PTY alone, piped text, JSON receipt or `--yes` cannot approve.

`continue` consumes the expiring one-time grant through the existing broker/dispatcher and applies only to the isolated workspace. It makes zero model calls. Per-write fences reject stale workers. Repeated completed effects cannot run again.

## Reject or revoke

`engineering reject --id ID` records a denial; `engineering revoke --id ID` revokes the appropriate grant. Neither repairs or replays an uncertain effect. Inspect the resulting durable state.

## Workspace boundary

Private-copy file/path admission, bounded patch validation and snapshots constrain writes, but do not form a race-free filesystem sandbox against a hostile same-UID process. The original project is never automatically integrated. A successful isolated apply is not evidence that tests passed. A patch grant never authorizes Podman.

## Source and evidence

[docs/phase9-personal-mode.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-personal-mode.md), [docs/phase9-workspaces.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-workspaces.md), [packages/application/src/engineering-resume.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/engineering-resume.ts), [apps/cli/src/human-approval.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/human-approval.ts).
