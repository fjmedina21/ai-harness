import type { Permission, RiskLevel } from "./index.js";

export type ToolValueType = "string" | "number" | "integer" | "boolean";

export interface ToolParameterSchema {
  type: ToolValueType;
  description?: string;
  minLength?: number;
  maxLength?: number;
  enum?: readonly string[];
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolParameterSchema>;
  required: readonly string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  id: string;
  description: string;
  permission: Permission;
  risk: RiskLevel;
  inputSchema: ToolInputSchema;
}

export interface ToolInvocation {
  toolId: string;
  arguments: unknown;
}

export interface ToolValidationResult {
  valid: boolean;
  errors: string[];
}
