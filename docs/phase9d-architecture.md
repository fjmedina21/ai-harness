# Phase 9D documentation architecture

Version **0.8.0**, experimental. The portal is a separate static VitePress app;
no operational authorization, approval, Podman or repair behavior changes.

## Components

- `apps/docs/.vitepress/config.ts`: stable VitePress 1.6.4, `/ai-harness/` base,
  default accessible theme, local search, page outline, syntax highlighting/copy.
- `navigation.json`: explicit section/page inventory shared with static checks.
- `theme/`: minimal CSS identity and reduced-motion/focus/responsive refinements.
- `public/`: original logo and eight SVG diagrams with text alternatives.
- Content: reader-oriented guides; explicit public includes reuse canonical changelog.
- `scripts/check.mjs`: static HTML link/anchor/asset/navigation/source-path and
  publication-boundary validation; negative `node:test` cases use in-memory fixtures.
- `scripts/cli-reference.mjs`: parses TypeScript AST to detect command/flag drift,
  never imports or executes privileged CLI composition.

`docs/` remains the detailed technical/evidence ledger; `docs/history/` remains
archival; private development/evidence stays locally excluded. The output/search
index includes only explicit portal content and the public changelog include.

## Build and publication boundary

pnpm lockfile installs VitePress reproducibly with only esbuild's explicitly
approved install script. Build/check require no provider, auth, Podman or network
once dependencies are available. Generated cache/dist stay ignored.
Ordinary CI has a separate docs job and retains code checks. A dispatch-only workflow builds/checks/uploads and deploys the static artifact from main.
The deploy job alone has pages:write/id-token:write and uses the github-pages
environment. configure-pages does not enable Pages automatically. The workflow
was created at the owner request but has not been run; no settings or release changes.

Future project Pages URL: `https://fjmedina21.github.io/ai-harness/`.
`cleanUrls: false` retains explicit `.html` routes. All local route/asset references
are checked against output under the base; local search is bundled.

## Verification limits

Static checks validate the emitted surface and explicit navigation, not every
JavaScript execution path or external URL. Browser review is recorded separately
in [verification](phase9d-verification.md). Accessibility follows the default theme
plus visible focus, contrast, semantic headings, alternatives and reduced motion;
no formal WCAG conformance claim is made.

Product and release gates remain independent: [readiness](phase9d-release-readiness.md).
