import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import type {
  ApproverIdentityVerifier,
  ToolApprovalScope,
} from "@ai-harness/contracts";

import {
  AuthenticatedApprovalService,
  FileApprovalAuditLog,
  ToolApprovalManager,
} from "../index.js";

const scope: ToolApprovalScope = {
  executionId: "execution-001",
  projectRoot: "/tmp/approval-project",
  toolId: "shell.execute",
  arguments: { command: "node --version" },
  permission: "shell:execute",
  risk: "high",
};

/**
 * Test-only verifier.
 *
 * NEVER use this implementation in production.
 */
class FixtureIdentityVerifier implements ApproverIdentityVerifier {
  async verify(credential: string) {
    if (credential === "valid-token") {
      return {
        subject: "operator-001",
        issuer: "test-idp",
        roles: ["harness:approver"],
      };
    }

    if (credential === "reader-token") {
      return {
        subject: "reader-001",
        issuer: "test-idp",
        roles: ["harness:reader"],
      };
    }

    throw new Error("Invalid credential");
  }
}

async function withAuditDirectory(
  callback: (directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harness-audit-"));

  try {
    await callback(directory);
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

function setup(directory: string) {
  const manager = new ToolApprovalManager();
  const audit = new FileApprovalAuditLog(directory);

  const service = new AuthenticatedApprovalService(
    manager,
    new FixtureIdentityVerifier(),
    audit,
  );

  return { manager, service, audit };
}

test("persists approval requests as JSONL", async () => {
  await withAuditDirectory(async (directory) => {
    const { service } = setup(directory);

    const record = await service.request(scope);

    const contents = await readFile(
      path.join(directory, "approval-events.jsonl"),
      "utf8",
    );

    const event = JSON.parse(contents.trim());

    assert.equal(event.type, "approval.requested");
    assert.equal(event.approvalId, record.id);
    assert.equal(event.argumentDigest, record.argumentDigest);

    assert.doesNotMatch(contents, /node --version/);
  });
});

test("authorized identity approves and creates audit event", async () => {
  await withAuditDirectory(async (directory) => {
    const { service, manager } = setup(directory);

    const record = await service.request(scope);

    const result = await service.decide(record.id, "valid-token", true);

    assert.equal(result.status, "approved");
    assert.equal(manager.get(record.id)?.decidedBy, "test-idp:operator-001");

    const contents = await readFile(
      path.join(directory, "approval-events.jsonl"),
      "utf8",
    );

    const events = contents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.equal(events.length, 2);
    assert.equal(events[1].type, "approval.decision_authorized");
    assert.equal(events[1].decision, "approved");
    assert.equal(events[1].actor, "test-idp:operator-001");
  });
});

test("rejects identities without approver role", async () => {
  await withAuditDirectory(async (directory) => {
    const { service, manager } = setup(directory);
    const record = await service.request(scope);

    await assert.rejects(
      service.decide(record.id, "reader-token", true),
      /not authorized/,
    );

    assert.equal(manager.get(record.id)?.status, "pending");
  });
});

test("rejects invalid credentials", async () => {
  await withAuditDirectory(async (directory) => {
    const { service, manager } = setup(directory);
    const record = await service.request(scope);

    await assert.rejects(
      service.decide(record.id, "invalid", true),
      /Invalid credential/,
    );

    assert.equal(manager.get(record.id)?.status, "pending");
  });
});

test("rejects decisions without audit persistence", async () => {
  await withAuditDirectory(async (directory) => {
    const { service, manager } = setup(directory);
    const record = await service.request(scope);

    const invalidDirectory = path.join(directory, "not-a-directory");

    await writeFile(invalidDirectory, "occupied");

    const brokenService = new AuthenticatedApprovalService(
      manager,
      new FixtureIdentityVerifier(),
      new FileApprovalAuditLog(invalidDirectory),
    );

    await assert.rejects(brokenService.decide(record.id, "valid-token", true));

    assert.equal(manager.get(record.id)?.status, "pending");
  });
});

test("authorized operator can deny an approval", async () => {
  await withAuditDirectory(async (directory) => {
    const { service, manager } = setup(directory);
    const record = await service.request(scope);

    const result = await service.decide(record.id, "valid-token", false);

    assert.equal(result.status, "denied");
    assert.equal(manager.get(record.id)?.status, "denied");
  });
});
