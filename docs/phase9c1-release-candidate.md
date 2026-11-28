# v0.9.0-beta.1 — candidate verification

Prepared **2026-11-27 America/Santo_Domingo** after the owner's instruction to
complete remaining checklist work. **Candidate, not released.** Base source:
`779daab899c2ef9875dc198785ad7b33489763e9`; branch
`test/phase9c-live-acceptance-beta-gate`.

## Completed preparation

- [Scoped real repair acceptance](phase9c1-live-acceptance.md): actual OpenAI
  generation, exact native decisions, failed → passed Podman validation and
  independent durable/source verification. Original live baseline version: 0.8.0.
- [Historical journal exclusion](phase9c1-historical-journal-exclusion.md):
  owner-authorized audit archive, no state/grant/claim rewriting or replay.
- Local candidate version **0.9.0-beta.1** aligned across 16 manifests, CLI output
  and current portal labels. No provider, repair, dispatcher or approval behavior
  change; the only CLI implementation change is its version output string.
- Concrete [release notes](releases/v0.9.0-beta.1-draft.md), requirements,
  compatibility limits and rollback procedure prepared for final owner review.

## Portal visual gate — PASS, sampled real browser review

The built loopback portal was opened in a native Microsoft Edge session under
`/ai-harness/`. Desktop and tablet screenshots were captured through DevTools
full-size capture, saved privately, reopened and visually inspected. This replaces
the earlier incomplete tablet/desktop capture result without rewriting that history.

| View | Observation |
| --- | --- |
| Tablet 768×1024, dark home | Readable header, stacked hero, feature grid, diagram and footer; no body clipping |
| Tablet 768×1024, light repair architecture | Context menu opened; theme changed; diagram, inline code, text and pager readable |
| Desktop 1280×800, dark repair architecture | Sidebar, active item, page outline, diagram and body layout readable |
| Desktop 1280×800, light repair guide | Sidebar/outline, code block containment, warnings and pager readable; Copy Code changed to Copied |
| Keyboard search | Cmd+K → NoProgress → Return navigated to architecture/repair.html#implemented-lifecycle |

Saved PNG widths were **1,536** pixels for 768-CSS-pixel tablet viewports and
**2,560** for 1,280-CSS-pixel desktop viewports (2× capture density); hashes and
dimensions are in the private visual-review record. Preliminary invalid responsive
input/capture attempts were excluded. The native application background thumbnail
is not used as visual evidence.

Review is sampled viewport emulation, not physical iPad testing or exhaustive WCAG
certification. The earlier mobile review remains separately documented. No visual
fix or new UI functionality was necessary.

## Source and acceptance continuity

The new candidate is not the original live run's Git SHA. Live evidence retains its
actual baseline SHA/time/project/profile and bounded scope. Candidate verification
must compare rebuilt critical executable digests and identify the CLI version-only
change separately. Unchanged runtime component fingerprints establish continuity
for those exact bytes, not a new paid/provider/native acceptance at another commit.
Any critical runtime or policy change requires fresh exact acceptance before release.

Candidate offline verification passed all 15 commands: frozen-lockfile install,
clean/build, **993/993** full tests, GitHub **150/150**, Personal **43/43**,
Phase9B **76/76**, Phase9C **120/120**, docs build/check, CLI help/version,
deterministic **19/19 with 42 assertions**, Phase9 **10/10** and diff whitespace.
The 16 manifest versions and actual CLI output match **0.9.0-beta.1**. Rebuilt
critical executable digest matches the live baseline exactly; the existing signed
acceptance still matched project policy and expiry when checked. No new provider
request or Podman workload was used for candidate regression. Hosted CI must still
pass build-test and docs-check on the exact final candidate SHA.

The owner subsequently explicitly authorized the version change, local commit,
publication of this candidate branch and hosted CI. That authorization excludes
merge, tag, release, Pages and new provider requests.

## Hosted CI and publication decision

[Run 46105350756](https://github.com/fjmedina21/ai-harness/actions/runs/46105350756) passed build-test and docs-check
on exact candidate `f98eded1a4977c95eedd28459a2bf1f4af6e1132`. This result closes
the candidate implementation/metadata CI gate. The following documentation-only
record commit must also pass the same workflow on its own SHA before release;
its definitive result is attached to that commit's GitHub Actions checks.
No runtime executable or policy is changed by that evidence-record update.

All tested technical gates passed for the bounded scope. **Publication remains
BLOCKED solely on final owner approval once final-SHA CI passes.** Concrete notes
are prepared for review. No merge, tag, release, package publication or new Pages
deployment is included. Version/branch/CI authorization is not release approval.
