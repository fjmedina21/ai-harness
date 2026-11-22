import type {
  ToolDefinition,
  ToolInvocation,
  ToolParameterSchema,
  ToolValidationResult,
} from "@ai-harness/contracts";

const TOOL_ID_PATTERN = /^[a-z][a-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateValue(value: unknown, schema: ToolParameterSchema): boolean {
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") return false;

      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return false;
      }

      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return false;
      }

      if (schema.enum && !schema.enum.includes(value)) {
        return false;
      }

      return true;

    case "number":
      return typeof value === "number" && Number.isFinite(value);

    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);

    case "boolean":
      return typeof value === "boolean";
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(definition: ToolDefinition): void {
    if (!TOOL_ID_PATTERN.test(definition.id)) {
      throw new Error(`Invalid tool ID: ${definition.id}`);
    }

    if (this.tools.has(definition.id)) {
      throw new Error(`Tool already registered: ${definition.id}`);
    }

    if (!definition.description.trim()) {
      throw new Error("Tool description cannot be empty");
    }

    const schema = definition.inputSchema;

    if (schema.type !== "object" || schema.additionalProperties !== false) {
      throw new Error("Unsupported tool input schema");
    }

    for (const field of schema.required) {
      if (!Object.hasOwn(schema.properties, field)) {
        throw new Error(`Required field is not declared: ${field}`);
      }
    }

    if (new Set(schema.required).size !== schema.required.length) {
      throw new Error("Duplicate required fields");
    }

    for (const [name, parameter] of Object.entries(schema.properties)) {
      if (!TOOL_ID_PATTERN.test(name)) {
        throw new Error(`Invalid parameter name: ${name}`);
      }

      if (
        !["string", "number", "integer", "boolean"].includes(parameter.type)
      ) {
        throw new Error(`Unsupported parameter type: ${name}`);
      }

      if (
        (parameter.minLength !== undefined &&
          (!Number.isSafeInteger(parameter.minLength) ||
            parameter.minLength < 0)) ||
        (parameter.maxLength !== undefined &&
          (!Number.isSafeInteger(parameter.maxLength) ||
            parameter.maxLength < 0)) ||
        (parameter.minLength !== undefined &&
          parameter.maxLength !== undefined &&
          parameter.minLength > parameter.maxLength)
      ) {
        throw new Error(`Invalid length constraints: ${name}`);
      }

      if (
        (parameter.minLength !== undefined ||
          parameter.maxLength !== undefined ||
          parameter.enum !== undefined) &&
        parameter.type !== "string"
      ) {
        throw new Error(`String constraints require string type: ${name}`);
      }
    }

    // Copy metadata to avoid retaining the caller's object.
    this.tools.set(definition.id, structuredClone(definition));
  }

  get(id: string): ToolDefinition | undefined {
    const definition = this.tools.get(id);

    return definition ? structuredClone(definition) : undefined;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((definition) =>
      structuredClone(definition),
    );
  }

  validate(invocation: ToolInvocation): ToolValidationResult {
    const definition = this.tools.get(invocation.toolId);

    if (!definition) {
      return {
        valid: false,
        errors: [`Unknown tool: ${invocation.toolId}`],
      };
    }

    if (!isRecord(invocation.arguments)) {
      return {
        valid: false,
        errors: ["Tool arguments must be an object"],
      };
    }

    const input = invocation.arguments;
    const schema = definition.inputSchema;
    const errors: string[] = [];

    for (const field of schema.required) {
      if (!Object.hasOwn(input, field)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    for (const [name, value] of Object.entries(input)) {
      if (!Object.hasOwn(schema.properties, name)) {
        errors.push(`Unknown field: ${name}`);
        continue;
      }

      const parameter = schema.properties[name]!;

      if (!validateValue(value, parameter)) {
        errors.push(`Invalid value for ${name}: expected ${parameter.type}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
export { BUILTIN_TOOLS } from "./builtins.js";
export { ToolDispatcher } from "./dispatcher.js";
export { fileReadHandler, registerFileTools } from "./file-tools.js";
export { ToolApprovalManager } from "./approval.js";
export { ContainerExecutor, NodeProcessRunner } from "./container-executor.js";

export type {
  ContainerCommand,
  ContainerExecutionOptions,
  ContainerExecutionResult,
  ProcessResult,
  ProcessRunner,
} from "./container-executor.js";
export { FileApprovalAuditLog } from "./approval-audit.js";

export { AuthenticatedApprovalService } from "./authenticated-approval.js";
export { fileWriteHandler } from "./file-write.js";

export { createGitStatusHandler } from "./git-tools.js";

export type { GitStatusOptions } from "./git-tools.js";

export { registerControlledWorkspaceTools } from "./controlled-workspace-tools.js";
