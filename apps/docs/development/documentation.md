# Documentation engineering and contributing

## Content ownership

`apps/docs` holds the reader-oriented portal and explicit navigation manifest. `docs/` retains technical specifications, verification ledgers and historical evidence. `docs/history/` is archival. Development-only evidence/notes remain locally excluded. Do not copy private acceptance records into searchable Markdown.

Use substantive grouped pages when several topics form one workflow. Add each portal page to `.vitepress/navigation.json`; source links identify the reviewed runtime snapshot. Update the capability matrix and verification ledger when evidence changes. A new source milestone is not a published release.

## Reproducible checks

```sh
pnpm install --frozen-lockfile
pnpm docs:check
pnpm docs:preview
```

VitePress 1.6.4 is pinned. It uses its default theme for keyboard navigation, local search, code highlighting/copy, page outline and light/dark modes. CSS and original SVG assets provide identity without extra component/runtime frameworks. No external fonts, analytics, forms or tracking are configured. The generated search index is public content.

The checker validates all generated local links/fragments/assets, navigation coverage, expected sections, version marker, config boundary and repository source-link targets. Negative tests mutate in-memory fixtures. External URLs are not fetched during normal checks. Browser tests remain a separate observed verification step; do not call a build a WCAG audit.

## GitHub Pages preparation

Base is `/ai-harness/`, clean URLs stay disabled for static `.html` compatibility. CI builds on pull requests without credentials. A dispatch-only workflow publishes a checked Pages artifact from main when explicitly run by the owner. Select GitHub Actions as the Pages source in repository settings first; configure-pages has enablement disabled. The deploy job alone has pages:write and id-token:write and uses the github-pages environment. Expected future URL: `https://fjmedina21.github.io/ai-harness/`.

The [phase verification report](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9d-verification.md) records actual results and limits. The docs portal and beta release have independent gates.

## Source and evidence

[package.json](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/package.json), [.github/workflows/ci.yml](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/.github/workflows/ci.yml), [docs/VERIFICATION.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/VERIFICATION.md).

## Publish with GitHub Actions

The owner requested a publishing action. After separately authorizing and merging this
source to `main`, choose **Settings → Pages → Build and deployment → GitHub Actions**.
Review the `github-pages` environment protection rules, then open **Actions → Publish
documentation to GitHub Pages (manual) → Run workflow**, selecting `main`. Other
branches/forks cannot enter the build/deploy job.

The workflow installs the frozen lockfile, runs all docs checks, uploads the Pages
artifact and deploys through the github-pages environment, honoring its configured protection rules. It uses no AI, Podman or
private runtime credentials. No push trigger is configured. Running it is a publication
action; this implementation did not dispatch it. Inspect the returned deployment URL
and verify navigation/search/assets on the actual host after publication.

## Dependency security decision

The stable VitePress 1.6.4 default Vite 5 dependency has development-server advisories.
A narrowly scoped pnpm override pins only `vitepress@1.6.4>vite` to **6.4.5**; its
Vue plugin accepts Vite 6. This intentionally overrides VitePress's declared Vite 5
range and is locally build/browser tested, not upstream compatibility certification.
Revalidate it on dependency upgrades. esbuild 0.25.12 is resolved transitively. The
final registry advisory snapshot reports zero known advisories, which is not proof
of absence of vulnerabilities. Development and preview bind loopback by default.

Official references: [VitePress 1.x requirements](https://vuejs.github.io/vitepress/v1/guide/getting-started),
[Vite 6.4.5 security fix](https://github.com/vitejs/vite/releases/tag/v6.4.5),
[Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
