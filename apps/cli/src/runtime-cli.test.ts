import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { initializeProject } from "@ai-harness/core";

import { main } from "./index.js";
import { executeRun, getRunStatus } from "./runtime-cli.js";

async function withProject(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-harness-cli-runtime-"));

  try {
    await initializeProject({
      root,
      projectName: "runtime-test",
    });

    await callback(root);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

test("CLI executes SDD and persists results", async () => {
  await withProject(async (root) => {
    const result = await executeRun({
      projectRoot: root,
      request: "Create a greeting module",
      provider: "fixture",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.stages.length, 5);

    const status = await getRunStatus(root, result.executionId);

    assert.equal(status.state, "completed");
    assert.equal(status.totalTasks, 5);
    assert.equal(status.completedTasks, 5);

    const filename = path.join(
      root,
      ".ai",
      "state",
      "executions",
      `${result.executionId}.json`,
    );

    const saved = JSON.parse(await readFile(filename, "utf8")) as {
      state: string;
      events: unknown[];
    };

    assert.equal(saved.state, "completed");
    assert.ok(saved.events.length > 0);
  });
});

test("CLI run and status commands work end-to-end", async () => {
  await withProject(async (root) => {
    const lines: string[] = [];

    const runCode = await main(
      [
        "run",
        "--path",
        root,
        "--request",
        "Create a greeting module",
        "--provider",
        "fixture",
      ],
      root,
      (line) => lines.push(line),
    );

    assert.equal(runCode, 0);

    const executionLine = lines.find((line) => line.startsWith("Execution: "));

    assert.ok(executionLine);

    const executionId = executionLine.slice("Execution: ".length);

    const statusLines: string[] = [];

    const statusCode = await main(
      ["status", "--path", root, "--id", executionId],
      root,
      (line) => statusLines.push(line),
    );

    assert.equal(statusCode, 0);

    assert.ok(statusLines.includes("Status: completed"));

    assert.ok(statusLines.includes("Tasks: 5/5 completed"));
  });
});

test("CLI rejects missing and invalid providers", async () => {
  await withProject(async (root) => {
    await assert.rejects(
      executeRun({
        projectRoot: root,
        request: "Create module",
        provider: "openai" as "fixture",
      }),
      /only the fixture provider/i,
    );
  });
});

test("status rejects unknown execution IDs", async () => {
  await withProject(async (root) => {
    await assert.rejects(getRunStatus(root, "unknown"), /Execution not found/);

    await assert.rejects(
      getRunStatus(root, "../outside"),
      /Invalid execution ID/,
    );
  });
});

test("run rejects projects without read permission", async () => {
  await withProject(async (root) => {
    const file = path.join(root, ".ai", "config.json");

    const config = JSON.parse(await readFile(file, "utf8")) as {
      security: {
        grantedPermissions: string[];
      };
    };

    config.security.grantedPermissions = [];

    const { writeFile } = await import("node:fs/promises");

    await writeFile(file, JSON.stringify(config, null, 2));

    await assert.rejects(
      executeRun({
        projectRoot: root,
        request: "Create module",
        provider: "fixture",
      }),
      /Execution denied by security policy/,
    );
  });
});
