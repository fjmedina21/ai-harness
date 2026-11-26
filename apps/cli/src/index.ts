#!/usr/bin/env node
import path from "node:path";
import { engineeringCommand, engineeringLifecycleCommand } from "./engineering-cli.js";
import { repairCommand } from "./repair-cli.js";
import { diagnosticCommand } from "./diagnostics-cli.js";
import { authCommand, loadGitHubHost, type GitHubHost } from "./github-host.js";
import { readPrivateCostRates } from "./rates.js";
import { executeRun, getRunStatus } from "./runtime-cli.js";
import { inspectWorkflowOperations, runReadOnlyWorkflow, type ProviderSelection } from "@ai-harness/application";
import { AGENT_ROLES } from "@ai-harness/contracts";
import {
  initializeProject,
  inspectProject,
  loadProjectConfig,
} from "@ai-harness/core";

export async function main(
  argv: string[],
  cwd = process.cwd(),
  output = console.log,
  signal?: AbortSignal,
  hostLoader: () => Promise<GitHubHost> = loadGitHubHost,
): Promise<number> {
  const [command, ...args] = argv;
  if (
    !command ||
    command === "--help" ||
    command === "-h" ||
    command === "help"
  ) {
    output(help());
    return 0;
  }
  if (command === "version" || command === "--version" || command === "-v") {
    output("ai-harness 0.8.0 (experimental)");
    return 0;
  }
  if (args.includes("--help") || args.includes("-h")) {
    output(help());
    return 0;
  }
  if (["eval", "metrics", "trace"].includes(command)) return diagnosticCommand(command, args, cwd, output);
  try {
    const root = optionValue(args, "--path") ?? cwd;
    const resolved = path.resolve(cwd, root);
    switch (command) {
      case "init": {
        rejectUnknown(args, ["--path", "--name"], ["--dry-run"]);
        const result = await initializeProject({
          root: resolved,
          projectName: optionValue(args, "--name"),
          dryRun: args.includes("--dry-run"),
        });
        output(
          `${result.dryRun ? "Would create" : "Created"} ${result.created.length} managed files in ${result.root}:`,
        );
        for (const file of result.created) output(`  ${file}`);
        return 0;
      }
      case "doctor": {
        rejectUnknown(args, ["--path"]);
        const result = await inspectProject(resolved);
        output(
          `OK: ${result.config.project.name}; schema v${result.config.schemaVersion}; ${result.agentCount} agents; workflows: ${result.workflows.join(", ")}`,
        );
        output(
          "Note: the default CLI uses the fixture provider; provider adapters and controlled tools require explicit host integration.",
        );
        return 0;
      }
      case "agents": {
        rejectUnknown(args, ["--path"]);
        const result = await inspectProject(resolved);
        output(result.config.agents.enabled.join("\n"));
        return 0;
      }
      case "config": {
        rejectUnknown(args, ["--path"]);
        output(JSON.stringify(await loadProjectConfig(resolved), null, 2));
        return 0;
      }

      case "auth": return authCommand(args, output, signal, hostLoader);
      case "engineering": return args[0]?.startsWith("repair") ? repairCommand(args, output, signal, hostLoader) : engineeringLifecycleCommand(args, output, signal, hostLoader);

      case "run": {
        if (optionValue(args, "--workflow") === "implement") return engineeringCommand(args, cwd, output, signal, hostLoader);
        rejectUnknown(args, ["--path", "--request", "--provider", "--workflow", "--model", "--fixture-file", "--journal", "--telemetry-dir", "--timeout-ms", "--rates", "--max-output-tokens", "--max-provider-requests"], ["--confirm-provider-call", "--json"]);

        const request = optionValue(args, "--request");

        if (!request) {
          throw new Error("--request is required");
        }

        const provider = optionValue(args, "--provider") ?? "fixture";
        const workflow = optionValue(args, "--workflow");

        if (workflow === "inspect") {
          let selection: ProviderSelection;
          if (provider === "fixture") {
            selection = { id: "fixture", readPath: optionValue(args, "--fixture-file") ?? "README.md" };
            if (optionValue(args, "--model") || args.includes("--confirm-provider-call") || optionValue(args, "--max-output-tokens") || optionValue(args, "--max-provider-requests"))
              throw new Error("Fixture mode does not accept real-provider model, token-budget, request-budget, or billing confirmation options");
          } else if (provider === "openai" || provider === "anthropic") {
            const model = optionValue(args, "--model");
            if (!model) throw new Error("--model is required for a real provider");
            const outputBudget = optionValue(args, "--max-output-tokens");
            const requestBudget = optionValue(args, "--max-provider-requests");
            if (!outputBudget || !requestBudget) throw new Error("Real providers require --max-output-tokens and --max-provider-requests");
            if (!args.includes("--confirm-provider-call"))
              throw new Error("Add --confirm-provider-call to authorize a potentially billable network request");
            if (optionValue(args, "--fixture-file")) throw new Error("--fixture-file is available only with the fixture provider");
            selection = {
              id: provider, model, paidCallConfirmed: true,
              maxOutputTokens: Number(outputBudget), maxProviderRequests: Number(requestBudget),
            };
          } else {
            throw new Error("Supported providers: fixture, openai, anthropic");
          }
          const timeoutValue = optionValue(args, "--timeout-ms");
          const timeoutMs = timeoutValue === undefined ? undefined : Number(timeoutValue);
          const result = await runReadOnlyWorkflow({
            projectRoot: resolved,
            request,
            provider: selection,
            ...(signal ? { signal } : {}),
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(optionValue(args, "--journal") ? { journalFile: path.resolve(cwd, optionValue(args, "--journal")!) } : {}),
            ...(optionValue(args, "--telemetry-dir") ? { telemetryDirectory: path.resolve(cwd, optionValue(args, "--telemetry-dir")!) } : {}),
            ...(optionValue(args, "--rates") ? { rates: await readPrivateCostRates(path.resolve(cwd, optionValue(args, "--rates")!)) } : {}),
            onProgress: (progress) => {
              if (args.includes("--json")) return;
              if (progress.kind === "tool") {
                output(`Tool ${progress.taskId}: ${progress.toolId} ${progress.toolStatus}`);
              } else if (progress.type === "execution.started") {
                output(`Planning execution ${progress.executionId}`);
              } else if (progress.type === "task.started") {
                output(`Running ${progress.taskId} (${progress.agentRole})`);
              } else if (progress.type === "task.completed") {
                output(`Completed ${progress.taskId}`);
              } else if (progress.type?.startsWith("execution.")) {
                output(`Execution ${progress.executionId}: ${progress.executionState}`);
              }
            },
          });
          if (args.includes("--json")) {
            output(JSON.stringify({
              ...result,
              tasks: result.tasks.map((task) => ({
                ...task,
                ...(task.summary ? { summary: limitOutput(task.summary) } : {}),
              })),
            }, null, 2));
          } else {
            output(`Execution: ${result.executionId}`);
            output(`Status: ${result.termination}`);
            output(`Provider/model: ${result.provider}/${result.model}`);
            output(`Tasks: ${result.completedTasks}/${result.totalTasks} completed`);
            output("Scope: source files were not changed; Harness checkpoint persisted under .ai/state; no tests executed");
            for (const task of result.tasks) {
              output(`\n${task.id} (${task.role}) — ${task.state}`);
              if (task.summary) output(limitOutput(task.summary));
            }
            for (const operation of result.operations) {
              output(`Operation ${operation.operationId}: ${operation.toolId} ${operation.state}`);
            }
            if (result.telemetry) {
              output(`Telemetry: ${result.telemetry.file ?? "in-memory"}`);
              if (result.telemetry.metrics) output(`Model calls: ${result.telemetry.metrics.modelCalls}; tool calls: ${result.telemetry.metrics.toolCalls}; errors: ${result.telemetry.metrics.errors}`);
              if (result.telemetry.metrics) {
                const tokens = result.telemetry.metrics.tokens;
                output(`Tokens: ${tokens.availability === "reported" ? `${tokens.inputTokens ?? "?"} input / ${tokens.outputTokens ?? "?"} output` : "unavailable"}`);
                const cost = result.telemetry.metrics.cost;
                output(`Estimated cost: ${cost.status === "estimated" ? `${cost.amount} ${cost.currency}` : `unknown (${cost.reason})`}`);
              }
              if (result.telemetry.diagnostics.dropped > 0) output(`Telemetry records dropped: ${result.telemetry.diagnostics.dropped}`);
            }
          }
          if (result.termination === "cancelled") return 130;
          if (result.termination === "timeout") return 124;
          return result.termination === "completed" ? 0 : 1;
        }

        if (workflow !== undefined) throw new Error("Supported workflow: inspect");
        if (provider !== "fixture") throw new Error("Select --workflow inspect to use OpenAI or Anthropic from the CLI");
        for (const flag of ["--model", "--fixture-file", "--journal", "--telemetry-dir", "--timeout-ms", "--rates", "--max-output-tokens", "--max-provider-requests", "--confirm-provider-call", "--json"])
          if (args.includes(flag)) throw new Error(`${flag} requires --workflow inspect`);

        const result = await executeRun({
          projectRoot: resolved,
          request,
          provider,
        });

        output(`Execution: ${result.executionId}`);
        output(`Status: ${result.status}`);
        output(`Stages completed: ${result.stages.length}`);

        for (const stage of result.stages) {
          output(`  ✓ ${stage}`);
        }

        return result.status === "completed" ? 0 : 1;
      }

      case "status": {
        rejectUnknown(args, ["--path", "--id", "--journal"]);

        const id = optionValue(args, "--id");

        if (!id) {
          throw new Error("--id is required");
        }

        const result = await getRunStatus(resolved, id);
        const operations = optionValue(args, "--journal")
          ? await inspectWorkflowOperations(path.resolve(cwd, optionValue(args, "--journal")!), id)
          : [];

        output(`Execution: ${result.executionId}`);
        output(`Status: ${result.state}`);
        output(
          `Tasks: ${result.completedTasks}/${result.totalTasks} completed`,
        );

        for (const task of result.tasks) {
          output(`  ${task.id}: ${task.state}`);
        }
        for (const operation of operations) output(`  ${operation.operationId}: ${operation.toolId} ${operation.state}`);

        return 0;
      }
      default:
        throw new Error(`Unknown command: ${command}. Use --help.`);
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const result = args[index + 1];
  if (!result || result.startsWith("--"))
    throw new Error(`${flag} requires a value.`);
  return result;
}
function rejectUnknown(
  args: string[],
  valued: string[],
  booleanFlags: string[] = [],
) {
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (valued.includes(token)) {
      if (seen.has(token)) throw new Error(`Duplicate option: ${token}`);
      seen.add(token);
      optionValue(args, token);
      index++;
      continue;
    }
    if (!booleanFlags.includes(token)) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    if (seen.has(token)) throw new Error(`Duplicate option: ${token}`);
    seen.add(token);
  }
}
function help(): string {
  return `AI Harness CLI — experimental
  \nUsage: harness <command> [options]\n
  \nCommands:
  \n  init [--path DIR] [--name NAME] [--dry-run]   Initialize .ai/ without overwriting files
  \n  run --path DIR --request TEXT [--provider fixture]
  \n  run --workflow inspect --path DIR --request TEXT [--provider fixture|openai|anthropic]
  \n       [--model MODEL --max-output-tokens N --max-provider-requests N --confirm-provider-call]
  \n       [--fixture-file FILE]
  \n       [--journal ABSOLUTE_FILE] [--telemetry-dir PRIVATE_DIR] [--rates PRIVATE_JSON]
  \n       [--timeout-ms N] [--json]
  \n  auth login|whoami|status|refresh|logout [--json]   GitHub App authentication with protected host sessions
  \n  engineering repair|repair-status|repair-history --id ID [--json] (finite, separately approved repair)\n  engineering status|diff|approve|reject|revoke|continue --id ID [--json] (GitHub scoped roles required)
  \n       Personal approval requires exact interactive review + macOS owner authentication.
  \n  engineering validate --id ID --profile PROFILE --action ACTION (requires accepted exact project/profile)
  \n  run --workflow implement --autonomy propose|isolated --path DIR --request TEXT --provider fixture
  \n       --files FILES_CSV --fixture-file FILE --fixture-content TEXT [--json]
  \n       [--workspace-dir PRIVATE_DIR --journal PRIVATE_FILE --checkpoint-dir PRIVATE_DIR --authorize-workspace]
  \n       [--max-iterations N] [--timeout-ms N]
  \n  status --path DIR --id EXECUTION_ID
  \n  doctor [--path DIR]                          Validate project configuration and declarations
  \n  agents [--path DIR]                          List enabled agent roles
  \n  config [--path DIR]                          Print validated configuration
  \n  eval run --suite deterministic|phase9                 Run offline host-owned fixtures
  \n  eval report --input FILE [--baseline FILE]      Inspect or compare private evaluation reports
  \n  trace --input FILE --id EXECUTION_ID            Inspect private JSONL spans
  \n  metrics --input FILE --id EXECUTION_ID          Summarize captured execution metrics
  \n  version                                      Display version
  \n  help                                         Show help\n

  \n  inspect supports only host-authorized read-only file access; it does not edit files or run tests.
  \nReal-provider calls can incur charges and require --confirm-provider-call, --model, an output/request budget and a host environment credential.
  \nImplement supports fixture recipes or OpenAI with --model, --max-provider-requests, --max-output-tokens, --confirm-provider-call and --allow-uncertain-cost. Independent --timeout-ms (global), --request-timeout-ms, --role-timeout-ms and --finalization-timeout-ms select finite host deadlines. Optional --max-total-tokens, --max-context-tokens, --max-context-bytes, --max-agent-turns, --allowed-paths and --operations select scope; isolated path/operation selections must match registered host policy while budgets may narrow host limits. Isolated mode requires a GitHub requester and trusted host policy and stops pending policy-bound human approval; Podman validation requires private accepted project/profile evidence and separate native human approval.\nNot exposed by the CLI: deployment, Git writes, arbitrary shell, unaccepted validation profiles, dashboard.`;
}

function limitOutput(value: string): string {
  return value.length > 4_000 ? `${value.slice(0, 4_000)}…[truncated]` : value;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  main(process.argv.slice(2), process.cwd(), console.log, controller.signal)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    }).finally(() => {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
    });
}
