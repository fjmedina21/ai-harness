# Phase 9C architecture

Version **0.8.0**, experimental. Phase 9C extends the existing local, single-owner
engineering composition with finite repair. It does not implement Phase 9D,
Team L2, original-source integration, publication or deployment.

The core consumes projects, validation units, authorized profiles/actions,
snapshots, normalized results and repair requests. Language detection and diagnostic
parsing belong to host-selected adapters. Provider integration reuses the existing
EngineeringAgentPort and ModelProviderAdapter; synthetic adapters demonstrate
contract independence, not new operational provider support.

```text
Static discovery → host profile selection → authorized validation evidence
    → RepairCoordinator → bounded repair agent → StructuredPatch
    → existing artifact store / dispatcher → pending Personal L2 review
    → fenced isolated application → pending separate sandbox review
    → existing Podman validation → durable result → next finite iteration
```

Contracts live in contracts; filesystem discovery and trusted profile admission in
tools; the SQLite repair state shares checkpointing's operation journal; application
composes repair with existing patch and approval services. There is no model-facing
journal, credential, policy registration or approval capability.

[Discovery](phase9c-project-discovery.md), [profiles](phase9c-validation-profiles.md),
[budgets](phase9c-repair-policy.md), [lifecycle](phase9c-state-machine.md),
[security](phase9c-security.md), [CLI](phase9c-cli.md) and [acceptance](phase9c-e2e.md)
describe the boundaries. Real acceptance remains **BLOCKED** pending a separate
explicitly authorized run; previous Gate C evidence does not accept changed code.
