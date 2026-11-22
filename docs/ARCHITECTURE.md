# AI Harness — Especificación maestra de arquitectura

- Estado: **Diseño aprobado / no implementado**
- Versión documental: **1.0.0**
- Fecha: **2026-11-21**
- Alcance: plataforma full stack agnóstica de proveedores de IA
- Metodología: SDD + ejecución iterativa + paralelismo seguro

## 1. Propósito y límites

Desarrollar un Harness extensible para coordinar agentes especializados en proyectos backend, frontend, móvil, bases de datos y DevOps. Debe admitir herramientas CLI/IDE nativas, un motor propio cuando haga falta y administración por CLI, API y dashboard. El núcleo no se acoplará a un modelo, SDK o framework de los proyectos gestionados.

**No objetivos del MVP:** plataforma distribuida completa, SSO empresarial, Kubernetes administrado, dashboard avanzado, failover universal entre proveedores, automatización irrestricta de despliegues. Estos objetivos son parte de la arquitectura final, no promesas de la primera entrega.

## 2. Registro consolidado de las 35 decisiones

| # | Decisión aceptada |
|---|---|
| 01 | Desarrollo full stack: backend, frontend, móvil e infraestructura. |
| 02 | Núcleo agnóstico con adaptadores multiplataforma de IA. |
| 03 | Sistema multiagente especializado con orquestador. |
| 04 | Autonomía configurable por proyecto (supervisada por defecto). |
| 05 | Catálogo de 15 agentes, incluyendo UI/UX. |
| 06 | Flujo adaptativo SDD, iterativo y paralelo para tareas independientes. |
| 07 | Memoria híbrida: archivos fuente de verdad y almacenamiento estructurado opcional. |
| 08 | Integraciones: archivos, shell, Git, GitHub/GitLab, Podman, BD, navegador, MCP, APIs, cloud, web y observabilidad. |
| 09 | Especificaciones proporcionales al riesgo y complejidad. |
| 10 | Validación adaptativa con corrección, reintentos acotados y evidencias. |
| 11 | Resiliencia avanzada: checkpoints, circuit breakers, rollback, fallback y aislamiento. |
| 12 | Zero Trust: RBAC, sandbox, secretos, auditoría y mínimo privilegio. |
| 13 | Núcleo central versionado y carpeta `.ai/` por proyecto. |
| 14 | Ejecución híbrida: capacidades nativas + motor propio para flujos complejos. |
| 15 | Enrutamiento de modelos por privacidad, costos, calidad, cuotas y local/cloud. |
| 16 | Aislamiento adaptable con Git Worktrees, contenedores, locks e integración controlada. |
| 17 | OpenTelemetry y dashboard de agentes, tareas, costos y aprobaciones. |
| 18 | Plugins versionados, skills, agentes personalizados, workflows y MCP. |
| 19 | Configuración jerárquica: núcleo, organización, proyecto, entorno, ejecución. |
| 20 | CLI, IDE, dashboard y API comparten servicios y controles. |
| 21 | TypeScript/Node.js (núcleo, orquestador, CLI); React o Next.js (dashboard). |
| 22 | Archivos + SQLite local + PostgreSQL compartido + Redis opcional + artefactos externos. |
| 23 | npm, binarios e imágenes OCI; SemVer, migraciones, compatibilidad, rollback. |
| 24 | Estándares jerárquicos versionados, detección de convenciones existentes. |
| 25 | Gestión de cambios con análisis de impacto, replanificación y aprobaciones. |
| 26 | Conocimiento reutilizable, documentación automática, ADR y búsqueda opcional. |
| 27 | FinOps adaptativo con límites, presupuestos, predicción y aprobación de excesos. |
| 28 | Identidad local y empresarial, multiusuario/multiorganización, OIDC/MFA/RBAC. |
| 29 | Local First, self-hosted y cloud-native por adaptadores de infraestructura. |
| 30 | CI/CD adaptativo multiplataforma, PR, controles, despliegue progresivo y rollback. |
| 31 | Validación del Harness: unitarias, integración, E2E, simulación, seguridad, resiliencia, contratos, evaluaciones y regresión. |
| 32 | Rendimiento adaptable, colas, backpressure y workers distribuidos opcionales. |
| 33 | Mantenimiento inteligente, actualizaciones controladas, migraciones y análisis de vulnerabilidades. |
| 34 | Implementación incremental, arquitectura completa especificada desde el inicio. |
| 35 | MVP con 10 criterios obligatorios y calidad estricta; dashboard y paralelismo aislado avanzado después. |

## 3. Roles de agentes (catálogo de 15)

1. `orchestrator`: delegación, coordinación, estados, políticas.
2. `requirements-analyst`: historias, requisitos, criterios de aceptación.
3. `software-architect`: diseños, ADR, contratos y análisis de impacto.
4. `planner`: DAG de tareas, prioridades y dependencias.
5. `backend-developer`: APIs, lógica de negocio y servicios.
6. `frontend-developer`: interfaces web y accesibilidad.
7. `mobile-developer`: aplicaciones móviles.
8. `database-specialist`: modelos, consultas y migraciones.
9. `qa-engineer`: pruebas y evidencias.
10. `security-specialist`: amenazas y revisiones de seguridad.
11. `devops-engineer`: entornos, imágenes y pipelines.
12. `code-reviewer`: calidad y compatibilidad.
13. `technical-writer`: documentación y ADR.
14. `validator`: verificación independiente de criterios.
15. `ui-ux-designer`: flujos, prototipos y sistema de diseño.

Un rol lógico no requiere necesariamente un proceso o modelo único. Su ejecución depende de las capacidades del adaptador instalado.

## 4. Arquitectura por capas

- **Interfaces:** CLI, IDE adapters, API, dashboard.
- **Aplicación:** casos de uso `init`, `plan`, `run`, `resume`, `approve`, `validate`, `doctor`, `upgrade`.
- **Dominio:** `Project`, `Specification`, `Task`, `Execution`, `AgentRole`, `PolicyDecision`, `Approval`, `Checkpoint`, `Evidence`, `Budget`.
- **Orquestación:** scheduler/DAG, estado de tarea, delegación, política de reintentos, límites de concurrencia, recuperación.
- **Puertos/adaptadores:** providers, model routing, shell, filesystem, Git, persistence, telemetry, approvals, tool execution, artifact storage.
- **Servicios transversales:** autorización, gestión de secretos, auditoría, FinOps, observabilidad.

### Puertos clave de TypeScript (contratos de diseño, aún sin implementación)

```ts
export interface AgentProvider {
  readonly id: string;
  capabilities(): Promise<ProviderCapabilities>;
  execute(request: AgentRequest, context: ExecutionContext): AsyncIterable<AgentEvent>;
  cancel(executionId: string): Promise<void>;
}
export interface PolicyEngine {
  authorize(action: ToolAction, context: SecurityContext): Promise<PolicyDecision>;
}
export interface ExecutionStore {
  persist(event: ExecutionEvent): Promise<void>;
  load(executionId: string): Promise<ExecutionSnapshot | null>;
}
export interface ToolAdapter {
  readonly id: string;
  execute(input: ToolInput, grantedScope: Grant): Promise<ToolResult>;
}
```

Los tipos mencionados se definirán en `packages/contracts`. En MVP, al menos dos adaptadores reales compatibles deben superar pruebas de contrato y una ejecución de punta a punta; no basta con mocks.

## 5. Máquina de estados y proceso SDD

`REQUESTED -> ANALYZING -> SPECIFIED -> PLANNED -> AWAITING_APPROVAL? -> RUNNING -> VALIDATING -> COMPLETED`

Ramas: `BLOCKED`, `FAILED`, `CANCELLED`, `PAUSED`, `RETRYING`; reanudación autorizada desde checkpoints. Registrar las transiciones en un log de eventos idempotente, con identificador estable, actor y correlación; nunca considerar finalizada una tarea sin evidencias. Se permiten especificaciones ligeras para cambios de bajo riesgo y completas para cambios críticos.

Flujo mínimo: solicitud -> criterios -> especificación -> DAG -> aprobación según política -> ejecución -> pruebas -> revisión -> evidencia -> cierre. Cambios de requisitos invalidan selectivamente nodos y sus dependientes; el orquestador recalcula el plan.

## 6. Política de ejecución y seguridad

- `deny-by-default` para herramientas sin permiso.
- Identidad diferenciada para usuario, agente y cuenta de servicio.
- Permisos por actor, acción, recurso, entorno, proyecto, organización y vencimiento.
- El agente **no** es un límite de seguridad: el ejecutor y los adaptadores deben imponer permisos efectivamente.
- Sandbox para comandos/archivos y restricciones de red cuando el entorno los soporte.
- Secretos por referencia a gestor seguro / entorno protegido; no incluirlos en prompts, logs, artefactos o Git.
- Requerir aprobación para operaciones destructivas, acceso a producción y despliegues.
- Prompts y archivos recuperados se consideran datos no confiables; no pueden sobrescribir políticas.
- En instalaciones locales, documentar las garantías reales del sandbox del SO; no presumir aislamiento fuerte si el ejecutor no puede ofrecerlo.
- El fallback entre proveedores está condicionado a consentimiento, permisos y residencia/privacidad de datos.

## 7. Persistencia y consistencia

- **Versionado en Git:** `.ai/config.yaml`, especificaciones, tareas declarativas, ADR, estándares, manifestos de workflows y decisiones aprobadas.
- **Operación local:** SQLite para eventos, estado de ejecuciones, aprobaciones, costos, checkpoints y auditoría (no almacenar secretos en claro).
- **Entorno compartido:** PostgreSQL como adaptador equivalente; multi-tenant con autorización por organización y pruebas de aislamiento.
- **Redis opcional:** coordinación, colas y locks; no única fuente durable de estado.
- **Almacenamiento externo:** blobs y artefactos grandes; guardar checksums/referencias en el estado.
- **Reanudación:** cada tarea usa claves de idempotencia; detectar side effects antes de repetir comandos externos.
- **Rollback:** revertir cambios Git/artefactos cuando sea posible; para bases de datos y recursos remotos usar compensación explícita o intervención humana, nunca prometer rollback universal.
- **Resiliencia:** checkpoints, timeout, circuit breaker, backoff con jitter, dead-letter y límite de pasos/reintentos.

## 8. Configuración y políticas

Precedencia propuesta para preferencias: `core < organization < project < environment < execution`. Las políticas globales obligatorias se aplican como restricciones acumulativas y no pueden relajarse por una capa inferior. `configSchemaVersion` requiere migraciones y chequeo de compatibilidad. Los valores secrets se referencian, nunca se guardan en YAML. Versionar estándares por lenguaje/framework, con detección y propuesta de adaptación para repositorios existentes.

## 9. Enrutamiento y costos

Router por capacidad requerida, contexto, privacidad, ubicación de datos, latencia, calidad, presupuesto y disponibilidad. El costo real puede no estar accesible; separar `estimatedCost` de `confirmedCost`. Uso de reservas atómicas de presupuesto para tareas paralelas, cancelación al agotarse cuotas y aprobación para extensiones. Caché sujeto a seguridad, versionado y control de información sensible.

## 10. Observabilidad y evidencia

OpenTelemetry para trazas, métricas y logs; `traceId`, `executionId`, `taskId`, `agentRole`, `providerId`, duración, tokens y costos (cuando el proveedor los exponga). Redacción de PII y secretos antes de exportar. Evidencias mínimas: comandos y resultados, hashes de artefactos, archivos modificados, resultados de pruebas, aprobación y versión de política. Dashboard futuro para tareas, gastos, checkpoints y aprobaciones.

## 11. Concurrencia

Construir DAG por dependencias; reservar archivos/recursos antes de ejecutar; usar worktrees Git para escrituras concurrentes, entornos aislados opcionales y serialización cuando existan conflictos; integración con pruebas y revisión. Operaciones remotas requieren control de concurrencia independiente de locks de archivos. Los workers distribuidos son una fase posterior.

## 12. Estrategia de compatibilidad y distribución

Distribución objetivo: npm, binarios autónomos Windows/macOS/Linux e imágenes OCI para Podman. Publicar SemVer para núcleo y contratos, catálogo de versiones de adaptadores, migraciones comprobables con `dry-run`, respaldo y rollback cuando aplique. El MVP entrega CLI instalable por npm, y los canales restantes pueden llegar después.

## 13. Control de cambios y conocimiento

Requisitos, ADR, specs y tareas versionadas. Cambios generan análisis de impacto y replanificación selectiva; conocimiento verificado queda separado de propuestas y de información obsoleta. Búsqueda semántica opcional, sin trasladar información entre organizaciones o proyectos privados sin permiso. Evitar documentar como confirmado aquello que no fue validado.

## 14. Riesgos, tradeoffs y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Compatibilidad desigual de herramientas IA | Feature detection, contrato de capacidades, adapters específicos y degradación explícita. |
| Ejecuciones no deterministas | Suite de simulación determinista + evaluaciones reales reproducibles con umbrales. |
| Prompt injection desde repositorio/web | Separación datos/instrucciones, policy enforcement fuera del modelo, aislamiento. |
| Cambios conflictivos | DAG, worktrees, revisión de merge y lock de recursos. |
| Costos impredecibles | Límites estrictos, reservas, contadores separados estimado/real. |
| Fallas al restaurar estado | Log transaccional, reejecución idempotente, simulaciones de corte. |
| Complejidad excesiva | Monorepo y MVP vertical completo, capacidades avanzadas como módulos opcionales. |

## 15. Definición de listo — MVP (10 criterios obligatorios)

1. `harness init` crea `.ai/` con validación de esquema.
2. Una solicitud se convierte en requisitos, specs, DAG y criterios de aceptación.
3. Orquestación real de al menos tres roles especializados.
4. Modificación controlada de un repositorio y ejecución de comandos para una funcionalidad verificable.
5. Pruebas y reparaciones acotadas, con evidencias; informar fallos no resueltos.
6. Persistencia local y reanudación desde checkpoint probado tras interrupción.
7. Dos adaptadores de IA reales ejecutan el flujo; superar contrato común.
8. Operación no autorizada bloqueada; acción crítica queda en espera de aprobación.
9. Logs, correlación, estados, errores y consumo **estimado** registrados.
10. Instalación reproducible de CLI y ejecución documentada.

**Gate de calidad estricta:** pruebas automatizadas de todos los criterios, evidencias adjuntas, documentación de uso y arquitectura, y ningún fallo crítico conocido. Lo no ejecutado/no verificado se reporta explícitamente. Dashboard completo y worktrees paralelos avanzados no son condiciones de aceptación del MVP.

## 16. Escenario vertical de demostración

Proyecto de ejemplo API + web mínimo: `harness init`, solicitud «agrega endpoint GET /health con prueba», análisis/spec, planificación, asignación de analista/implementador/QA, modificación en worktree o rama autorizada, ejecución de test, registro de evidencias, pausa/aprobación de una acción protegida, interrupción simulada, reanudación desde checkpoint y reporte final. Repetir con un segundo adaptador de proveedor para comprobar compatibilidad.
