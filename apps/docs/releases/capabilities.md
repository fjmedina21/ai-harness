# Capability status

AI Harness **0.9.0-beta.1 — experimental**. This matrix separates implemented contracts,
deterministic tests and actual operational acceptance. Snapshot: **2026-11-26**,
initial source `def9a98`; documentation work does not renew runtime acceptance.

**The core is language-agnostic, but operational support for each toolchain depends
on authorized and validated profiles.** A detected manifest is not an executable
profile. A registered profile is not live acceptance.

## Current matrix

| Capability | Implementation / offline evidence | Operational boundary |
| --- | --- | --- |
| GitHub Authentication | IMPLEMENTED; OFFLINE VERIFIED | Historical LIVE VERIFIED macOS owner lifecycle; current online owner/session checks still required |
| Personal L2 | IMPLEMENTED; OFFLINE VERIFIED | Historical LIVE VERIFIED for synthetic local projects; every exact new patch needs fresh typed and native confirmation |
| Project Authorization | IMPLEMENTED; OFFLINE VERIFIED | Host-owned canonical project policy; exercised in historical restricted live workflows; no global rights from login |
| Podman Local Gate C | IMPLEMENTED; OFFLINE VERIFIED | Historical LIVE VERIFIED only for registered synthetic/local-podman fixed Node scope; code/project/profile/expiry must revalidate |
| Current-code isolation probes | Fixed runtime probes reviewed | Limited real isolation/timeout/cancellation/cleanup observations; not coordinated Gate C or repair E2E acceptance |
| Language-Agnostic Validation Contracts | IMPLEMENTED; OFFLINE VERIFIED | Discovery, profiles and normalized diagnostics are reusable contracts; no universal toolchain support |
| Autonomous Repair | IMPLEMENTED; OFFLINE VERIFIED; scoped LIVE VERIFIED | Finite and supervised; 2026-11-27 exact local synthetic E2E passed; [beta remains blocked](beta.md) |
| Durable SQLite Journal / recovery | IMPLEMENTED; OFFLINE VERIFIED | Historical scoped live continuation/evidence inspection; uncertain effects require reconciliation |
| OpenAI engineering | IMPLEMENTED; OFFLINE VERIFIED | Historical bounded synthetic workflow smoke; no general task correctness or new paid-call authorization |
| Anthropic adapters | IMPLEMENTED; OFFLINE VERIFIED | Native tool-calling/inspection contracts exist; no accepted Anthropic engineering workflow claim |
| Local documentation portal | Implemented by Phase 9D | Build/browser/CI results recorded separately; no Pages publication claimed |
| Remote Podman | DEFERRED | Dedicated infrastructure and real remote acceptance absent |
| Production Autonomous Execution | BLOCKED / NOT CERTIFIED | No production guarantee, source integration, auto-merge or autonomous deployment |
| Team / multiuser management | NOT IMPLEMENTED operationally | One developer / one GitHub owner; historical Team records are inspection-only |

## Evidence scopes

The [Phase 9C acceptance record](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md)
records 993/993 full offline tests and 120/120 repair tests using synthetic external
authorities with real temporary files, SQLite, artifacts and process boundaries.
These counts describe the recorded source; current Phase 9D verification is separate.

The [historical real report](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-real-acceptance-report.md)
records exact local owner/native/Podman outcomes. A signed private acceptance is
bounded by its expiry, source/project/policy/runtime fingerprints and evidence.
Those results do not accept changed repair code, another project or another profile.

Phase 9C.1 inspection found passing current fixed isolation probes, but no verified
completed real repair lifecycle. Isolated probe results cannot replace two separate
patch decisions and two separate sandbox decisions with durable failure/repair/pass
evidence. Private evidence remains outside the portal and local search index.

Initial code CI passed for `def9a98` in [run 45739242316](https://github.com/fjmedina21/ai-harness/actions/runs/45739242316).
That run does not certify unpublished Phase 9D changes. The GitHub releases endpoint
returned no releases at this assessment; internal source milestones are not releases.

## What a status does and does not establish

- **IMPLEMENTED**: the component and contracts exist in source.
- **OFFLINE VERIFIED**: deterministic checks passed for their recorded scope.
- **LIVE VERIFIED**: an actual authorized workflow passed for the exact documented
  host/project/profile/source scope; it is not perpetual authorization.
- **BLOCKED**: a required acceptance condition or evidence is missing.
- **DEFERRED**: the capability remains outside current operational scope.

No single “fully supported” label combines these different evidence scopes.
Read the [security limitations](../security/limitations.md) before choosing an
operational workflow. The beta gate remains **BLOCKED** until the required real
repair acceptance and release checks are complete.
