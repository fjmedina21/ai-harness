# Roadmap de implementación — AI Harness

> Secuencia recomendada sin comprometer fechas ni esfuerzo antes de medir capacidad del equipo. Cada fase produce una entrega verificable; las capacidades dependientes permanecen desactivadas hasta superar sus gates.

## Fase 0 — Fundaciones y contratos
**Objetivo:** monorepo, tooling, dominio, políticas mínimas, contratos y diseño versionado.

- Definir decisiones ADR para motor, persistencia, sandbox y proveedores.
- `pnpm` workspaces + TypeScript strict, lint, test, build, CI.
- Paquetes `contracts`, `core`, `cli`, `provider-sdk`, `policy-engine`, `storage-sqlite`.
- Esquema versionado de `.ai/config.yaml` y migraciones.
- Simuladores de agentes y herramientas, fixture de proyecto de prueba.

**Gate:** build/test reproducibles, prueba de contrato en mock y `harness doctor` reporta dependencias.

## Fase 1 — MVP funcional de extremo a extremo (ACEPTACIÓN OBLIGATORIA)
**Objetivo:** cumplir los 10 criterios seleccionados sin dashboard ni workers distribuidos.

- CLI `init`, `plan`, `run`, `status`, `resume`, `approve`, `doctor`.
- SDD liviano/completo según riesgo, specs y tareas trazables.
- Orquestador con al menos tres roles; scheduler inicialmente secuencial con DAG.
- Dos adaptadores reales seleccionables; detección de capacidades y validación de contratos.
- Herramientas Git, filesystem y shell mediadas por permisos; sandbox de ejecución soportado.
- SQLite con log de eventos, checkpoint, auditoría y restauración real.
- Quality gates con pruebas, reintentos acotados, evidencias y revisión.
- OpenTelemetry básico o implementación compatible instrumentada desde el núcleo.
- Ejemplo reproducible y documentación.

**Gate:** pasar los 10 escenarios de `ARCHITECTURE.md` §15 en CI y demo de interrupción/reanudación. 0 defectos críticos conocidos. Pruebas negativas de seguridad.

## Fase 2 — Aislamiento y extensibilidad
- Agregar más roles y perfiles tecnológicos/versionados.
- Plugins, skills, manifiestos y MCP; permisos granulares.
- Git Worktrees, gestión de conflictos, colas, locks, ejecución paralela segura.
- Resiliencia avanzada: circuit breakers, fallback autorizado, backoff, compensaciones, dead-letter.
- Estándares, ADR, knowledge base, documentación automática.

**Gate:** ejecución paralela sin conflictos y suite de compatibilidad de plugins; recuperación de fallos inyectados.

## Fase 3 — API, dashboard y gobierno operativo
- API de administración versionada y CLI integrada.
- Dashboard React/Next.js: tareas, agentes, aprobaciones, costos, checkpoints.
- OpenTelemetry export a backends, redacción de datos.
- FinOps jerárquico, presupuestos atómicos, cuotas, alertas y estimaciones.
- Gestión de cambios con replanificación selectiva.

**Gate:** aprobación segura desde UI, correlación end-to-end y límites de presupuesto bajo concurrencia.

## Fase 4 — Colaboración y despliegue empresarial
- PostgreSQL, autorización multi-tenant, OIDC/SSO, MFA vía IdP.
- Docker Compose, workers distribuidos, Redis opcional, Kubernetes/cloud adapters.
- CI/CD para GitHub Actions, GitLab CI y Azure DevOps; revisión PR y pipelines con aprobaciones.
- Distribución npm + binarios; migración y rollback ensayados.

**Gate:** pruebas de aislamiento entre organizaciones, deploy reproducible, tolerancia a reinicios.

## Fase 5 — Optimización y evolución continua
- Router avanzado local/cloud: privacidad, calidad, disponibilidad y costo.
- Evaluaciones comparativas entre proveedores y regresión automatizada.
- Escalado adaptativo según recursos, latencia y presupuesto.
- Mantenimiento de plugins/adapters y actualizaciones con migración/rollback verificados.
- Recuperación semántica opcional bajo controles de datos.

**Gate:** SLO definidos y medidos, evaluaciones repetibles, actualizaciones no disruptivas demostradas.

## Dependencias clave

`Fundaciones -> MVP -> {aislamiento + extensibilidad} -> {dashboard + gobierno} -> {multiusuario + distribuido} -> {optimización avanzada}`.

La seguridad base, trazabilidad y pruebas comienzan en Fase 0/1 y se amplían en todas las fases; nunca se posponen por completo.

## Orden sugerido de implementación del MVP

1. Monorepo, CI, esquema y CLI `init`.
2. Modelo de estados, SQLite y event journal.
3. Parser/generador SDD, analista + planificador + orquestador.
4. Interfaz de proveedores + adapters reales y mock.
5. Política de herramientas y ejecutor de Git/shell/filesystem.
6. Agente implementador + QA + evidencias.
7. Reanudación/errores/checkpoints/aprobación.
8. Instrumentación y pruebas E2E de aceptación.

## Primeras decisiones técnicas pendientes de validación

- Versiones exactas de Node, TypeScript y pnpm; elegir al iniciar implementación y fijarlas.
- Primeros dos proveedores reales: seleccionar según disponibilidad de credenciales y métodos de invocación documentados.
- Política concreta de sandbox para macOS, Linux y Windows (capacidades diferentes).
- Backend del dashboard: React SPA o Next.js; decidir antes de Fase 3.
- Biblioteca de esquemas, CLI, ORM y tests tras spike técnico.

No confundir alcance objetivo con capacidades ya implementadas.
