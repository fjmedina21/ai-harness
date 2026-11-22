
import { randomUUID } from "node:crypto";
import {
  constants,
} from "node:fs";
import {
  mkdir,
  open,
} from "node:fs/promises";
import path from "node:path";

import type {
  ApprovalAuditEvent,
} from "@ai-harness/contracts";

const MAX_EVENT_BYTES = 4_096;

export class FileApprovalAuditLog {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    if (!path.isAbsolute(directory)) {
      throw new Error("Audit directory must be absolute");
    }
  }

  append(
    event: Omit<ApprovalAuditEvent, "eventId" | "timestamp">,
  ): Promise<void> {
    // Serialize writes within this process.
    const operation = this.queue.then(async () => {
      const record: ApprovalAuditEvent = {
        ...event,
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
      };

      const line = JSON.stringify(record) + "\n";

      if (
        Buffer.byteLength(line, "utf8") >
        MAX_EVENT_BYTES
      ) {
        throw new Error("Audit event exceeds size limit");
      }

      await mkdir(this.directory, {
        recursive: true,
        mode: 0o700,
      });

      const filename = path.join(
        this.directory,
        "approval-events.jsonl",
      );

      const handle = await open(
        filename,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_APPEND |
          constants.O_NOFOLLOW,
        0o600,
      );

      try {
        await handle.writeFile(line, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });

    // Do not permanently poison the queue when one
    // append operation fails.
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }
}
