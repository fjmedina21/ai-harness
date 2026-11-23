import type { ValidationEvidence, WorkspaceSnapshot } from "@ai-harness/contracts";
import { engineeringLimit } from "./engineering-workspace.js";
export interface EngineeringValidationCommand {
  id: string;
  intent: "build" | "unit_tests" | "integration_tests" | "static_analysis" | "format_check" | "type_check";
  image: string;
  /** Fixed argv selected by the host. Never passed to a shell. */
  argv: readonly string[];
  timeoutMs: number;
  maxLogBytes: number;
  resources: { cpu: number; memoryBytes: number; pids: number };
}
/** Descriptions only: registering a command grants no execution privilege. */
export class EngineeringValidationRegistry {
  private readonly commands = new Map<string, EngineeringValidationCommand>();
  register(command: EngineeringValidationCommand): void {
    if (!/^[a-z][a-z0-9._-]{0,63}$/.test(command.id) || this.commands.has(command.id) ||
        !["build", "unit_tests", "integration_tests", "static_analysis", "format_check", "type_check"].includes(command.intent) ||
        !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(command.image) ||
        !command.argv.length || command.argv.length > 32 || command.argv.some(a => typeof a !== "string" || !a || a.length > 256 || /[\0\r\n]/.test(a)) ||
        ["sh", "bash", "zsh", "fish", "cmd", "powershell"].includes(command.argv[0]!.split("/").at(-1)!)) throw new Error("Invalid host validation command");
    engineeringLimit(command.timeoutMs, 120_000); engineeringLimit(command.maxLogBytes, 16_384);
    engineeringLimit(command.resources.memoryBytes, 268_435_456); engineeringLimit(command.resources.pids, 64);
    if (!Number.isFinite(command.resources.cpu) || command.resources.cpu <= 0 || command.resources.cpu > 0.5) throw new Error("Validation resource limit");
    this.commands.set(command.id, structuredClone(command));
  }
  get(id: string): EngineeringValidationCommand {
    const command = this.commands.get(id);
    if (!command) throw new Error("Validation command not authorized");
    return structuredClone(command);
  }
}
export class EngineeringSandboxBlocked extends Error {
  constructor() { super("L3 blocked: approved digest-bound snapshot transfer and current real Podman isolation evidence required"); this.name = "EngineeringSandboxBlocked"; }
}
/** Deliberately does not call the existing probe-only Podman executor. */
export class PodmanEngineeringValidator {
  readonly available = false;
  async validate(_snapshot: WorkspaceSnapshot, _workspaceId: string, _command: EngineeringValidationCommand, _signal?: AbortSignal): Promise<ValidationEvidence> {
    throw new EngineeringSandboxBlocked();
  }
}
