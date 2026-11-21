import {
  AGENT_ROLES,
  HARNESS_SCHEMA_VERSION,
  type AgentRole,
  type Permission,
} from "@ai-harness/contracts";

export interface HarnessConfig {
  schemaVersion: number;
  project: { name: string; kind: "fullstack" };
  autonomy: { mode: "supervised" | "manual" };
  security: {
    defaultDeny: true;
    grantedPermissions: Permission[];
    requireApprovalFor: Permission[];
  };
  agents: { enabled: AgentRole[] };
  workflows: { default: string };
  storage: { mode: "files" };
}
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Treat config as untrusted input: no unsafe casts until structural checks pass. */
export function validateConfig(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ["Configuration must be an object."] };
  if (value.schemaVersion !== HARNESS_SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${HARNESS_SCHEMA_VERSION}.`);
  if (
    !isRecord(value.project) ||
    typeof value.project.name !== "string" ||
    !value.project.name.trim() ||
    value.project.kind !== "fullstack"
  )
    errors.push('project requires a non-empty name and kind "fullstack".');
  if (
    !isRecord(value.autonomy) ||
    !["supervised", "manual"].includes(String(value.autonomy.mode))
  )
    errors.push("autonomy.mode must be supervised or manual.");
  const security = value.security;
  const permissions = [
    "files:read",
    "files:write",
    "shell:execute",
    "git:write",
    "deployment:execute",
  ];
  if (
    !isRecord(security) ||
    security.defaultDeny !== true ||
    !isSubset(security.grantedPermissions, permissions) ||
    !isSubset(security.requireApprovalFor, permissions)
  ) {
    errors.push(
      "security requires defaultDeny=true and valid permission lists.",
    );
  }
  if (
    !isRecord(value.agents) ||
    !isSubset(value.agents.enabled, [...AGENT_ROLES])
  )
    errors.push("agents.enabled contains an unknown agent role.");
  if (
    !isRecord(value.workflows) ||
    typeof value.workflows.default !== "string" ||
    !value.workflows.default.trim()
  )
    errors.push("workflows.default must be a non-empty string.");
  if (!isRecord(value.storage) || value.storage.mode !== "files")
    errors.push('Phase 0 supports only storage.mode="files".');
  return { valid: errors.length === 0, errors };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isSubset(value: unknown, allowed: string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) => typeof item === "string" && allowed.includes(item),
    ) &&
    new Set(value).size === value.length
  );
}
export function createDefaultConfig(projectName: string): HarnessConfig {
  if (!projectName.trim()) throw new Error("Project name cannot be empty.");
  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    project: { name: projectName, kind: "fullstack" },
    autonomy: { mode: "supervised" },
    security: {
      defaultDeny: true,
      grantedPermissions: ["files:read"],
      requireApprovalFor: [
        "files:write",
        "shell:execute",
        "git:write",
        "deployment:execute",
      ],
    },
    agents: { enabled: [...AGENT_ROLES] },
    workflows: { default: "sdd-iterative" },
    storage: { mode: "files" },
  };
}
