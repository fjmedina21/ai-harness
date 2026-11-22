# Estructura inicial del monorepo

```text
ai-harness/
├── README.md
├── ARCHITECTURE.md
├── ROADMAP.md
├── REPOSITORY.md
├── pnpm-workspace.yaml
├── package.json
├── .gitignore
├── .github/workflows/            # Pipeline al implementar
├── apps/
│   ├── cli/                       # harness init/plan/run/approve/resume
│   ├── api/                       # API administrativa; fase 3
│   └── dashboard/                 # Next.js o React; fase 3
├── packages/
│   ├── contracts/                 # Tipos, schemas, eventos y puertos
│   ├── core/                      # Casos de uso / dominio
│   ├── orchestrator/              # DAG, scheduler, transiciones
│   ├── sdd/                       # Specs, criterios, traceabilidad
│   ├── agent-runtime/             # Roles y ejecución de agentes
│   ├── provider-sdk/              # Interfaz común y capacidades
│   ├── tool-runtime/              # Herramientas con enforcement
│   ├── policy-engine/             # Autorización / aprobación
│   ├── checkpointing/             # Recovery / idempotencia
│   ├── storage-sqlite/            # Estado local
│   ├── storage-postgres/          # Estado compartido, fase 4
│   ├── telemetry/                 # OTel + evidencia
│   ├── finops/                    # Presupuestos, fase 3
│   └── plugin-sdk/                # Extensiones, fase 2
├── adapters/
│   ├── providers/                 # Proveedores concretos a elegir
│   ├── tools/                     # fs, shell, git, Podman, browser, MCP
│   └── infrastructure/            # Workers, cloud y storage
├── agents/                        # 15 manifiestos de roles
├── skills/                        # Capacidades compartidas por dominio
├── standards/                     # Globales / perfiles tecnológicos
├── workflows/                     # SDD, feature, bugfix, review
├── templates/
│   └── project-ai/                # Template de carpeta .ai/
├── examples/
│   └── demo-project/              # Fixture e2e
├── tests/
│   ├── contracts/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── resilience/
├── docs/
│   ├── adr/
│   ├── architecture/
│   └── operations/
└── infra/
    ├── containers/
    └── kubernetes/
```

## Convenciones

- `apps` son entry points; `packages` contienen dominio/servicios reutilizables; `adapters` implementan puertos; `agents` y `workflows` son definiciones versionables.
- `.ai/` vive dentro de cada proyecto administrado y jamás contiene credenciales.
- Archivos fuente de verdad en Git; estados operativos e historiales extensos fuera del repositorio.
- Separar APIs públicas y contratos de implementación; contratos semánticamente versionados.
- El scaffold adjunto es **estructura documental**, no CLI o motor operativo. Los directorios vacíos son placeholders.

## Plantilla `.ai/` por proyecto

```text
.ai/
├── config.yaml
├── agents/
├── specs/
├── tasks/
├── workflows/
├── standards/
├── knowledge/
│   └── adr/
└── memory/
    └── README.md
```

Los checkpoints locales reales deberían ubicarse en almacenamiento privado (`.ai-runtime/` ignorado por Git o almacén adaptador), manteniendo solo referencias y metadatos no sensibles en documentación versionada.
