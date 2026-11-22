import assert from "node:assert/strict";
import test from "node:test";

import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BUILTIN_TOOLS,
  ToolApprovalManager,
  ToolDispatcher,
  ToolRegistry,
  createGitStatusHandler,
  fileWriteHandler,
} from "../index.js";

async function withWorkspace(callback: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-write-"));

  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function setup(root: string, permissions: string[] = []) {
  const registry = new ToolRegistry();

  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool);
  }

  const approvals = new ToolApprovalManager();
  const dispatcher = new ToolDispatcher(registry, approvals);

  dispatcher.registerHandler("file.write", fileWriteHandler);

  const context = {
    executionId: "execution-write-001",
    projectRoot: root,
    defaultDeny: true as const,
    grantedPermissions: permissions as ("files:read" | "files:write")[],
    requireApprovalFor: ["files:write"] as "files:write"[],
  };

  return { approvals, dispatcher, context };
}

test("denies writes without permission", async () => {
  await withWorkspace(async (root) => {
    const { dispatcher, context } = setup(root);

    const result = await dispatcher.dispatch(
      {
        toolId: "file.write",
        arguments: {
          path: "hello.txt",
          content: "hello",
        },
      },
      context,
    );

    assert.equal(result.status, "denied");
  });
});

test("requires approval before writing a file", async () => {
  await withWorkspace(async (root) => {
    const { dispatcher, context } = setup(root, ["files:write"]);

    const result = await dispatcher.dispatch(
      {
        toolId: "file.write",
        arguments: {
          path: "hello.txt",
          content: "hello",
        },
      },
      context,
    );

    assert.equal(result.status, "approval_required");

    assert.ok(result.approvalId);

    await assert.rejects(readFile(path.join(root, "hello.txt")));
  });
});

test("executes an approved write exactly once", async () => {
  await withWorkspace(async (root) => {
    const { approvals, dispatcher, context } = setup(root, ["files:write"]);

    const invocation = {
      toolId: "file.write",
      arguments: {
        path: "hello.txt",
        content: "hello",
      },
    };

    const pending = await dispatcher.dispatch(invocation, context);

    assert.equal(pending.status, "approval_required");

    approvals.decide(pending.approvalId!, "test-operator", true);

    // Test-only host decision. Production authorization
    // must use AuthenticatedApprovalService.
    const executed = await dispatcher.dispatch(
      invocation,
      context,
      pending.approvalId,
    );

    assert.equal(executed.status, "executed");

    assert.equal(await readFile(path.join(root, "hello.txt"), "utf8"), "hello");

    const replay = await dispatcher.dispatch(
      invocation,
      context,
      pending.approvalId,
    );

    assert.equal(replay.status, "denied");
  });
});

test("rejects overwriting an existing file", async () => {
  await withWorkspace(async (root) => {
    await writeFile(path.join(root, "existing.txt"), "original");

    await assert.rejects(
      fileWriteHandler(
        {
          path: "existing.txt",
          content: "modified",
        },
        {
          executionId: "test",
          projectRoot: root,
        },
      ),
    );

    assert.equal(
      await readFile(path.join(root, "existing.txt"), "utf8"),
      "original",
    );
  });
});

test("rejects traversal and restricted directories", async () => {
  await withWorkspace(async (root) => {
    for (const filename of [
      "../outside.txt",
      ".env",
      ".git/config",
      ".ai/settings.json",
      "secrets.txt",
    ]) {
      await assert.rejects(
        fileWriteHandler(
          { path: filename, content: "bad" },
          {
            executionId: "test",
            projectRoot: root,
          },
        ),
      );
    }
  });
});

test("rejects oversized file content", async () => {
  await withWorkspace(async (root) => {
    await assert.rejects(
      fileWriteHandler(
        {
          path: "large.txt",
          content: "x".repeat(70_000),
        },
        {
          executionId: "test",
          projectRoot: root,
        },
      ),
      /size limit/,
    );
  });
});

test("git.status reports changes without modifying them", async () => {
  await withWorkspace(async (root) => {
    execFileSync("git", ["init", "-q", root]);

    await writeFile(path.join(root, "README.md"), "initial");

    execFileSync("git", ["-C", root, "add", "README.md"]);

    const handler = createGitStatusHandler({
      executable: "/usr/bin/git",
    });

    const result = (await handler(
      {},
      {
        executionId: "git-test",
        projectRoot: root,
      },
    )) as {
      format: string;
      trackedChanges: string;
    };

    assert.equal(result.format, "porcelain-v1-z");

    assert.match(result.trackedChanges, /README\.md/);

    assert.equal(
      await readFile(path.join(root, "README.md"), "utf8"),
      "initial",
    );
  });
});

test("rejects relative Git executable paths", () => {
  assert.throws(
    () =>
      createGitStatusHandler({
        executable: "git",
      }),
    /must be absolute/,
  );
});
