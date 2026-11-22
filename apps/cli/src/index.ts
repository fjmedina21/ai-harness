#!/usr/bin/env node
import path from "node:path";
import { executeRun, getRunStatus } from "./runtime-cli.js";
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
    output("ai-harness 0.5.0 (experimental)");
    return 0;
  }
  if (args.includes("--help") || args.includes("-h")) {
    output(help());
    return 0;
  }
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

      case "run": {
        rejectUnknown(args, ["--path", "--request", "--provider"]);

        const request = optionValue(args, "--request");

        if (!request) {
          throw new Error("--request is required");
        }

        const provider = optionValue(args, "--provider") ?? "fixture";

        if (provider !== "fixture") {
          throw new Error("Only --provider fixture is supported in this phase");
        }

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
        rejectUnknown(args, ["--path", "--id"]);

        const id = optionValue(args, "--id");

        if (!id) {
          throw new Error("--id is required");
        }

        const result = await getRunStatus(resolved, id);

        output(`Execution: ${result.executionId}`);
        output(`Status: ${result.state}`);
        output(
          `Tasks: ${result.completedTasks}/${result.totalTasks} completed`,
        );

        for (const task of result.tasks) {
          output(`  ${task.id}: ${task.state}`);
        }

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
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (valued.includes(token)) {
      optionValue(args, token);
      index++;
      continue;
    }
    if (!booleanFlags.includes(token))
      throw new Error(`Unexpected argument: ${token}`);
  }
}
function help(): string {
  return `AI Harness CLI — experimental\n
  \nUsage: harness <command> [options]\n
  \nCommands:
  \n  init [--path DIR] [--name NAME] [--dry-run]   Initialize .ai/ without overwriting files
  \n  run --path DIR --request TEXT [--provider fixture]
  \n  status --path DIR --id EXECUTION_ID
  \n  doctor [--path DIR]                          Validate project configuration and declarations
  \n  agents [--path DIR]                          List enabled agent roles
  \n  config [--path DIR]                          Print validated configuration
  \n  version                                      Display version
  \n  help                                         Show help\n

  \nNot exposed by the default CLI: resume, deployment, approvals, provider selection, isolated runtime, dashboard.\n `;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
