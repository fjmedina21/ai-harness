import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  RuntimeCheckpointStore,
  RuntimeExecution,
} from "@ai-harness/contracts";

export class FileRuntimeCheckpointStore implements RuntimeCheckpointStore {
  private readonly directory: string;

  constructor(projectRoot: string) {
    this.directory = path.join(
      path.resolve(projectRoot),
      ".ai",
      "state",
      "executions",
    );
  }

  private filename(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("Invalid execution ID");
    }

    return path.join(this.directory, `${id}.json`);
  }

  async save(execution: RuntimeExecution): Promise<void> {
    const destination = this.filename(execution.id);

    await mkdir(this.directory, {
      recursive: true,
      mode: 0o700,
    });

    const temporary = path.join(this.directory, `.${randomUUID()}.tmp`);

    try {
      await writeFile(temporary, JSON.stringify(execution, null, 2) + "\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });

      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async get(executionId: string): Promise<RuntimeExecution | null> {
    const filename = this.filename(executionId);

    let content: string;

    try {
      content = await readFile(filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }

    const data: unknown = JSON.parse(content);

    if (
      !data ||
      typeof data !== "object" ||
      !("id" in data) ||
      data.id !== executionId ||
      !("tasks" in data) ||
      !Array.isArray(data.tasks) ||
      !("events" in data) ||
      !Array.isArray(data.events)
    ) {
      throw new Error("Invalid checkpoint contents");
    }

    return data as RuntimeExecution;
  }
}
