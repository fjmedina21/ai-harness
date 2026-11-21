import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import type { ToolDispatchContext } from "@ai-harness/contracts";

import {
  BUILTIN_TOOLS,
  registerFileTools,
  ToolDispatcher,
  ToolRegistry,
} from "./index.js";

function createDispatcher(): ToolDispatcher {
  const registry = new ToolRegistry();

  for (const definition of BUILTIN_TOOLS) {
    registry.register(definition);
  }

  const dispatcher = new ToolDispatcher(registry);
  registerFileTools(dispatcher);

  return dispatcher;
}

function context(root: string): ToolDispatchContext {
  return {
    executionId: "file-tools-test",
    projectRoot: root,
    defaultDeny: true,
    grantedPermissions: ["files:read"],
    requireApprovalFor: [
      "files:write",
      "shell:execute",
      "git:write",
      "deployment:execute",
    ],
  };
}

async function withWorkspace(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-file-tools-"));

  try {
    await mkdir(path.join(root, "src"));

    await writeFile(
      path.join(root, "src", "index.ts"),
      "export const value = 42;\n",
    );

    await writeFile(path.join(root, ".env"), "API_KEY=private");

    await callback(root);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

test("reads an authorized workspace file", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: "src/index.ts",
        },
      },
      context(root),
    );

    assert.equal(result.status, "executed");

    const data = result.data as {
      content: string;
      path: string;
      bytes: number;
    };

    assert.equal(data.path, "src/index.ts");
    assert.match(data.content, /value = 42/);
    assert.ok(data.bytes > 0);
  });
});

test("blocks directory traversal", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: "../outside.txt",
        },
      },
      context(root),
    );

    assert.equal(result.status, "failed");
  });
});

test("blocks absolute file paths", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: path.join(root, "src", "index.ts"),
        },
      },
      context(root),
    );

    assert.equal(result.status, "failed");
  });
});

test("blocks symbolic links", async () => {
  await withWorkspace(async (root) => {
    await symlink(
      path.join(root, "src", "index.ts"),
      path.join(root, "linked.ts"),
    );

    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: "linked.ts",
        },
      },
      context(root),
    );

    assert.equal(result.status, "failed");
  });
});

test("blocks common secret files", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: ".env",
        },
      },
      context(root),
    );

    assert.equal(result.status, "failed");
  });
});

test("blocks oversized files", async () => {
  await withWorkspace(async (root) => {
    await writeFile(path.join(root, "large.txt"), "x".repeat(1024 * 1024 + 1));

    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.read",
        arguments: {
          path: "large.txt",
        },
      },
      context(root),
    );

    assert.equal(result.status, "failed");
  });
});

test("file writes remain blocked", async () => {
  await withWorkspace(async (root) => {
    const dispatcher = createDispatcher();

    const result = await dispatcher.dispatch(
      {
        toolId: "file.write",
        arguments: {
          path: "output.txt",
          content: "Hello",
        },
      },
      {
        ...context(root),
        grantedPermissions: ["files:read", "files:write"],
      },
    );

    assert.equal(result.status, "approval_required");
  });
});
