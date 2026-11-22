import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  OpenAIProvider,
  AnthropicProvider,
  FixtureProvider,
} from "@ai-harness/providers";
import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "@ai-harness/tools";
import { createReadOnlyToolCallingAgent, ToolCallingAgent } from "../index.js";
import type {
  AgentExecutionContext,
  TaskDefinition,
} from "@ai-harness/contracts";

const task: TaskDefinition = {
  id: "review",
  title: "Review",
  description: "Inspect project",
  assignedRole: "software-architect",
  dependsOn: [],
  risk: "low",
  acceptanceCriteria: ["Use verified tool data"],
};
type Body = Record<string, any>;

for (const vendor of ["openai", "anthropic"] as const) {
  const Provider = vendor === "openai" ? OpenAIProvider : AnthropicProvider;
  function output(
    body: Body,
    args: unknown = { path: "README.md" },
    git = false,
  ) {
    const content = [
      vendor === "openai"
        ? {
            type: "function_call",
            call_id: "read_1",
            name: body.tools[0].name,
            arguments: JSON.stringify(args),
          }
        : {
            type: "tool_use",
            id: "read_1",
            name: body.tools[0].name,
            input: args,
          },
    ];
    if (git)
      content.push(
        vendor === "openai"
          ? {
              type: "function_call",
              call_id: "git_1",
              name: body.tools[1].name,
              arguments: "{}",
            }
          : {
              type: "tool_use",
              id: "git_1",
              name: body.tools[1].name,
              input: {},
            },
      );
    return vendor === "openai"
      ? { status: "completed", output: content }
      : { role: "assistant", stop_reason: "tool_use", content };
  }
  function final() {
    return vendor === "openai"
      ? {
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Verified" }],
            },
          ],
        }
      : {
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Verified" }],
        };
  }
  function context(root: string): AgentExecutionContext {
    return {
      executionId: "integration_1",
      projectRoot: root,
      model: new FixtureProvider(),
      grantedPermissions: ["files:read"],
    };
  }

  test(`${vendor}: opt-in agent reads a real file and Git status through dispatcher`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "harness-provider-"));
    try {
      await writeFile(path.join(root, "README.md"), "Fixture project data");
      await promisify(execFile)("git", ["init", "--quiet", root]);
      let calls = 0;
      let closes = 0;
      const provider = new Provider({
        model: "test",
        apiKey: "test-only",
        fetcher: async (_url, init) => {
          const body: Body = JSON.parse(String(init?.body));
          calls++;
          assert.equal(body.tools.length, 2);
          if (calls === 1) return Response.json(output(body, undefined, true));
          const results =
            vendor === "openai"
              ? body.input.filter(
                  (item: Body) => item.type === "function_call_output",
                )
              : body.messages.at(-1).content;
          assert.equal(results.length, 2);
          assert.equal(
            vendor === "openai" ? results[0].call_id : results[0].tool_use_id,
            "read_1",
          );
          const file = JSON.parse(
            vendor === "openai" ? results[0].output : results[0].content,
          );
          assert.equal(file.content, "Fixture project data");
          const git = JSON.parse(
            vendor === "openai" ? results[1].output : results[1].content,
          );
          assert.equal(git.format, "porcelain-v1-z");
          assert.equal(git.trackedChanges, "");
          return Response.json(final());
        },
      });
      const original = provider.openSession.bind(provider);
      provider.openSession = (...args) => {
        const session = original(...args);
        return {
          ...session,
          close() {
            closes++;
            session.close();
          },
        };
      };
      const agent = createReadOnlyToolCallingAgent({
        role: task.assignedRole,
        systemPrompt: "Review",
        provider,
        requireApprovalFor: [],
        git: { executable: "/usr/bin/git" },
      });
      const result = await agent.execute(task, context(root));
      assert.equal(result.success, true, result.error);
      assert.equal(result.summary, "Verified");
      assert.equal(calls, 2);
      assert.equal(closes, 1);
      assert.equal(
        await readFile(path.join(root, "README.md"), "utf8"),
        "Fixture project data",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const mode of [
    "denied",
    "approval",
    "schema",
    "sensitive",
    "privileged",
  ]) {
    test(`${vendor}: opt-in agent stops on ${mode} without a fabricated success`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "harness-denial-"));
      try {
        await writeFile(path.join(root, "README.md"), "Fixture");
        await writeFile(path.join(root, ".env"), "fixture only");
        let calls = 0;
        let closes = 0;
        const provider = new Provider({
          model: "test",
          apiKey: "test-only",
          fetcher: async (_url, init) => {
            calls++;
            const body: Body = JSON.parse(String(init?.body));
            assert.equal(body.tools.length, 1); // no write, shell, Git write or deploy
            const response: Body = output(
              body,
              mode === "schema"
                ? { path: 123 }
                : { path: mode === "sensitive" ? ".env" : "README.md" },
            );
            if (mode === "privileged") {
              const item =
                vendor === "openai" ? response.output[0] : response.content[0];
              item.name = "shell_execute";
            }
            return Response.json(response);
          },
        });
        const original = provider.openSession.bind(provider);
        provider.openSession = (...args) => {
          const session = original(...args);
          return {
            ...session,
            close() {
              closes++;
              session.close();
            },
          };
        };
        const agent = createReadOnlyToolCallingAgent({
          role: task.assignedRole,
          systemPrompt: "Review",
          provider,
          requireApprovalFor: mode === "approval" ? ["files:read"] : [],
        });
        const ctx = context(root);
        if (mode === "denied") ctx.grantedPermissions = [];
        const result = await agent.execute(task, ctx);
        assert.equal(result.success, false);
        assert.equal(calls, 1);
        assert.equal(closes, 1);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  test(`${vendor}: cancellation after a started tool prevents the next tool and model turn`, async () => {
    let requests = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        requests++;
        return Response.json(
          output(JSON.parse(String(init?.body)), { path: "README.md" }, true),
        );
      },
    });
    const registry = new ToolRegistry();
    for (const definition of BUILTIN_TOOLS.filter((tool) =>
      ["file.read", "git.status"].includes(tool.id),
    ))
      registry.register(definition);
    const dispatcher = new ToolDispatcher(registry);
    const controller = new AbortController();
    let started = 0;
    dispatcher.registerHandler("file.read", async () => {
      started++;
      controller.abort();
      return { content: "operation already ran" };
    });
    dispatcher.registerHandler("git.status", async () => {
      started++;
      return {};
    });
    const agent = new ToolCallingAgent({
      role: task.assignedRole,
      systemPrompt: "Review",
      provider,
      registry,
      dispatcher,
      allowedToolIds: ["file.read", "git.status"],
      requireApprovalFor: [],
    });
    const ctx = { ...context("/tmp"), signal: controller.signal };
    const outcome = await agent.execute(task, ctx);
    assert.equal(outcome.success, false);
    assert.equal(requests, 1);
    assert.equal(started, 1); // completed side effect is not rolled back
    assert.match(outcome.error ?? "", /cancelled/);
  });
}
