# Security model and trust boundaries

**Authentication != Authorization != Approval.** GitHub verifies identity. Host policy determines accessible projects/resources. Personal L2 confirms human intent for an exact patch. A separate sandbox grant authorizes one exact code execution. Podman enforces a restricted runtime configuration within documented residual limits.

![Independent identity, host authorization, patch approval and sandbox approval controls.](/diagrams/authority.svg)

## Untrusted data

Model text, tool outputs, repository documents, manifests, proposed patches and diagnostics are data. None may select host executables, expand paths/budgets, register tools, alter Keychain/journals, approve a change or accept an isolation profile.

The host-owned allowlist, schema validation, registry, Default Deny policy and `ToolDispatcher` form the permission boundary. Privileged effects additionally use current identity/project checks, exact grant binding, CAS and fencing. Read-only inspection does not inherit sandbox execution permission.

## Scope of assurance

Offline tests exercise simulated identity, presence, HTTP and Podman alongside real temporary files/SQLite and subprocesses. Historical real tests apply only to their exact owner/project/code/runtime scope. They do not prove arbitrary project correctness or infallible isolation.

Review [identity controls](./identity.md), [isolation](./podman.md), [threats](./threat-model.md) and [limitations](./limitations.md) before operational use.

## Source and evidence

[docs/phase9-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-security.md), [docs/phase9b-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-security.md), [docs/phase9c-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-security.md), [docs/phase2-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase2-security.md), [docs/phase3-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase3-security.md).
