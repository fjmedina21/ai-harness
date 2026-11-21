import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_ROLES } from "@ai-harness/contracts";
import {
  createDefaultConfig,
  validateConfig,
  type HarnessConfig,
} from "@ai-harness/config";

const CONFIG_FILE = path.join(".ai", "config.json");
const MANAGED_FILES = [
  CONFIG_FILE,
  path.join(".ai", "agents.json"),
  path.join(".ai", "workflows", "sdd-iterative.json"),
  path.join(".ai", "specs", "README.md"),
  path.join(".ai", "tasks", "README.md"),
  path.join(".ai", "memory", "README.md"),
  path.join(".ai", ".gitignore"),
] as const;

export interface InitOptions {
  root: string;
  projectName?: string;
  dryRun?: boolean;
}
export interface InitResult {
  created: string[];
  root: string;
  dryRun: boolean;
}

/** Non-destructive initialization. Will not overwrite existing managed files. */
export async function initializeProject(
  options: InitOptions,
): Promise<InitResult> {
  const root = path.resolve(options.root);
  const existing = await Promise.all(
    MANAGED_FILES.map(async (file) => pathExists(path.join(root, file))),
  );
  const occupied = MANAGED_FILES.filter((_, index) => existing[index]);
  if (occupied.length)
    throw new Error(
      `Refusing to overwrite existing files: ${occupied.join(", ")}. Back up or remove them explicitly before retrying.`,
    );
  const projectName = options.projectName ?? path.basename(root);
  const config = createDefaultConfig(projectName);
  const content: Record<string, string> = {
    [CONFIG_FILE]: JSON.stringify(config, null, 2) + "\n",
    [path.join(".ai", "agents.json")]:
      JSON.stringify(
        AGENT_ROLES.map((role) => ({ role, enabled: true })),
        null,
        2,
      ) + "\n",
    [path.join(".ai", "workflows", "sdd-iterative.json")]:
      JSON.stringify(
        {
          id: "sdd-iterative",
          version: 1,
          steps: [
            "requirements",
            "specification",
            "planning",
            "implementation",
            "validation",
          ],
          approval: "risk-based",
          status: "declarative-only",
        },
        null,
        2,
      ) + "\n",
    [path.join(".ai", "specs", "README.md")]:
      "# Specifications\n\nSDD specifications and acceptance criteria will live here.\n",
    [path.join(".ai", "tasks", "README.md")]:
      "# Tasks\n\nTask definitions will live here.\n",
    [path.join(".ai", "memory", "README.md")]:
      "# Memory\n\nVersioned decisions and non-sensitive project context.\n",
    [path.join(".ai", ".gitignore")]: "state/\ncheckpoints/\n*.secret*\n",
  };
  if (!options.dryRun) {
    await mkdir(root, { recursive: true });
    for (const file of MANAGED_FILES) {
      const fullPath = path.join(root, file);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content[file]!, {
        encoding: "utf8",
        flag: "wx",
      });
    }
  }
  return { created: [...MANAGED_FILES], root, dryRun: !!options.dryRun };
}
export async function loadProjectConfig(root: string): Promise<HarnessConfig> {
  const file = path.join(path.resolve(root), CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${describeError(error)}`);
  }
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${file}.`);
  }
  const result = validateConfig(config);
  if (!result.valid)
    throw new Error(`Invalid configuration: ${result.errors.join(" ")}`);
  return config as HarnessConfig;
}
export async function inspectProject(root: string) {
  const config = await loadProjectConfig(root);
  const agentFile = path.join(path.resolve(root), ".ai", "agents.json");
  const workflows = path.join(path.resolve(root), ".ai", "workflows");
  const agentText = await readFile(agentFile, "utf8");
  const agents: unknown = JSON.parse(agentText);
  if (
    !Array.isArray(agents) ||
    agents.length !== AGENT_ROLES.length ||
    agents.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        !("role" in item) ||
        !AGENT_ROLES.includes(item.role),
    )
  )
    throw new Error("agents.json has invalid agent descriptors.");
  const workflowNames = (await readdir(workflows)).filter((name) =>
    name.endsWith(".json"),
  );
  if (!workflowNames.includes(config.workflows.default + ".json"))
    throw new Error("Default workflow declaration not found.");
  return { config, agentCount: agents.length, workflows: workflowNames };
}
async function pathExists(file: string) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
