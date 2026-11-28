---
layout: home
hero:
  name: AI Harness
  text: Local-First AI Software Engineering Harness
  tagline: "<strong>Experimental — v0.9.0-beta.1</strong><br>Explicit roles. Provider-neutral contracts. Human control over every code and sandbox effect."
  image:
    src: /logo.svg
    alt: AI Harness original identity
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started/
    - theme: alt
      text: Explore the Architecture
      link: /architecture/
    - theme: alt
      text: Capability Status
      link: /releases/capabilities
features:
  - title: Local-first architecture
    details: Projects, isolated copies and durable evidence stay under host control. Provider use is explicit and bounded.
    link: /architecture/
  - title: Multi-agent workflows
    details: Sequential specialist roles turn a request into a structured proposal. Review and validator roles do not themselves establish test success.
    link: /guide/workflows
  - title: Provider independence
    details: Shared completion and tool-call contracts isolate OpenAI and Anthropic wire formats. Engineering CLI currently selects fixture or OpenAI.
    link: /guide/providers
  - title: Human-confirmed Personal L2
    details: One GitHub owner, per-project authorization, exact diff review, typed APPROVE and fresh native macOS authentication.
    link: /guide/personal-l2
  - title: Restricted Podman validation
    details: Fixed Node actions, pinned images, separate sandbox grants and durable evidence. Live acceptance is exact and expires; it is never global support.
    link: /guide/podman
  - title: Supervised finite repair
    details: Language-neutral validation contracts and bounded repair iterations are offline verified. Real repair E2E passed for the exact authorized local synthetic scope; beta readiness remains blocked.
    link: /guide/repair
---

<main aria-label="AI Harness overview">

::: warning Experimental — v0.9.0-beta.1
This is an experimental single-developer tool. Implementation, offline verification and real operational acceptance are separate. There is no production autonomy certification, automatic integration or deployment. The proposed `v0.9.0-beta.1` is an unpublished draft.
:::

## A workflow you can inspect

Read a bounded project selection, prepare a proposal, review the exact diff, approve an isolated change, and separately approve an accepted sandbox action. Inspect durable results before any next iteration.

![System overview: CLI and host compose agents, providers, dispatcher and private durable state.](/diagrams/system.svg)

**The core is language-agnostic, but operational support for each toolchain depends on authorized and validated profiles.** Detecting a manifest does not establish a working toolchain. See the [capability matrix](./releases/capabilities.md) and [beta blockers](./releases/beta.md).

</main>
