import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ToolDispatchContext,
  ToolHandlerContext,
} from "@ai-harness/contracts";

import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "../index.js";

import { shellExecuteHandler } from "../shell-tools.js";

async function withWorkspace(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-shell-"));

  try {
    await callback(root);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

function handlerContext(root: string): ToolHandlerContext {
  return {
    executionId: "shell-test",
    projectRoot: root,
  };
}

function dispatchContext(
  root: string,
  permissions: ToolDispatchContext["grantedPermissions"],
): ToolDispatchContext {
  return {
    ...handlerContext(root),
    defaultDeny: true,
    grantedPermissions: permissions,
    requireApprovalFor: ["shell:execute"],
  };
}

function createDispatcher(): ToolDispatcher {
  const registry = new ToolRegistry();

  for (const definition of BUILTIN_TOOLS) {
    registry.register(definition);
  }

  const dispatcher = new ToolDispatcher(registry);

  dispatcher.registerHandler("shell.execute", shellExecuteHandler);

  return dispatcher;
}

test("executes a fixed allowlisted command", async () => {
  await withWorkspace(async (root) => {
    const result = (await shellExecuteHandler(
      { command: "node --version" },
      handlerContext(root),
    )) as {
      command: string;
      exitCode: number;
      stdout: string;
    };

    assert.equal(result.command, "node --version");
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^v\d+\./);
  });
});

test("rejects arbitrary commands and shell injection", async () => {
  await withWorkspace(async (root) => {
    for (const command of [
      "node -e process.exit(0)",
      "node --version && echo unsafe",
      "node --version | cat",
      "rm -rf anything",
    ]) {
      await assert.rejects(
        shellExecuteHandler({ command }, handlerContext(root)),
        /not allowlisted/,
      );
    }
  });
});

test("rejects an invalid workspace", async () => {
  await assert.rejects(
    shellExecuteHandler(
      { command: "node --version" },
      handlerContext(
        path.join(os.tmpdir(), "nonexistent-harness-dir-123456789"),
      ),
    ),
  );
});

test("Dispatcher requires approval for shell execution", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "shell.execute",
        arguments: {
          command: "node --version",
        },
      },
      dispatchContext(root, ["shell:execute"]),
    );

    assert.equal(result.status, "approval_required");
    assert.equal(result.data, undefined);
  });
});

test("Dispatcher denies shell without granted permission", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "shell.execute",
        arguments: {
          command: "node --version",
        },
      },
      dispatchContext(root, ["files:read"]),
    );

    assert.equal(result.status, "denied");
    assert.equal(result.data, undefined);
  });
});
