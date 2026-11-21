import type { ToolDefinition } from "@ai-harness/contracts";

export const BUILTIN_TOOLS: readonly ToolDefinition[] = [
  {
    id: "file.read",
    description: "Read a UTF-8 file inside the project workspace",
    permission: "files:read",
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative file path",
          minLength: 1,
          maxLength: 4096,
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    id: "file.write",
    description: "Write a UTF-8 file inside the workspace",
    permission: "files:write",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          minLength: 1,
          maxLength: 4096,
        },
        content: {
          type: "string",
          maxLength: 1_000_000,
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    id: "shell.execute",
    description: "Execute a strictly allowlisted command through a controlled subprocess",
    permission: "shell:execute",
    risk: "high",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    id: "git.status",
    description: "Inspect the Git working tree",
    permission: "files:read",
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];
