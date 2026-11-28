# Introduction

AI Harness is a TypeScript monorepo for local, supervised AI software engineering. A trusted host selects projects, providers, roles, tool permissions and finite budgets. Models produce untrusted text or structured proposals; they cannot grant authority.

Start with the [offline Quick Start](./quick-start.md). It needs no login, API key or Podman. Move to [authentication](./authentication.md) and [project authorization](./project-authorization.md) only for protected engineering operations.

## Choose a workflow

| Path | What it does | Important limit |
| --- | --- | --- |
| Default `run` | Fixture-backed SDD proposal stages | Does not implement and test a real application |
| `run --workflow inspect` | Three roles using bounded read-only context | Persists Harness state; no source editing or tests |
| `run --workflow implement --autonomy propose` | Structured engineering proposal and advisory review | Requires explicit scopes and provider budgets |
| `--autonomy isolated` | Creates a private working copy and pending patch | No application before exact Personal approval |
| `engineering validate` | Separately approved fixed Podman action | Requires current exact runtime acceptance |
| `engineering repair` | Finite proposal/validation coordination | Offline verified; scoped local live acceptance passed; new execution still requires exact authorization |

The [security model](../security/index.md) explains why authentication, authorization and approval remain distinct. The [status matrix](../releases/capabilities.md) gives the evidence scope, including historical live tests.

## Source and evidence

[README.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/README.md), [apps/cli/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md).
