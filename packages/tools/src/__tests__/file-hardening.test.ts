import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, appendFile, readFile, rename, symlink, link, rm, open, lstat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { readBoundedFile, readVerifiedFile } from "../bounded-file.js";
import { fileReadHandler, resolveReadableFile } from "../file-tools.js";
import { fileWriteHandler } from "../file-write.js";

async function workspace(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "harness-hardening-"));
  try { await mkdir(path.join(root, "src")); await writeFile(path.join(root, "src/file.txt"), "original"); await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const ctx = (root: string) => ({ executionId: "test", projectRoot: root });

test("incremental reader enforces limit plus one sentinel on a growing real file", async () => {
  await workspace(async (root) => {
    const filename = path.join(root, "grow.txt"); await writeFile(filename, "x".repeat(10));
    const handle = await open(filename, "r"); let transferred = 0; let reads = 0;
    try {
      await assert.rejects(readBoundedFile({ async read(buffer, offset, length, position) {
        const result = await handle.read(buffer, offset, Math.min(length, 5), position);
        transferred += result.bytesRead; if (++reads === 1) await appendFile(filename, "y".repeat(100)); return result;
      } }, 20), /maximum size/);
      assert.equal(transferred, 21);
    } finally { await handle.close(); }
  });
});
test("bounded reads preserve exact-budget UTF8 and empty content", async () => {
  await workspace(async (root) => {
    const filename = path.join(root, "exact.txt"); await writeFile(filename, "😀".repeat(262144));
    const result = await fileReadHandler({ path: "exact.txt" }, ctx(root)) as { bytes: number; content: string };
    assert.equal(result.bytes, 1048576); assert.equal(result.content.length, 524288);
    await writeFile(filename, "");
    assert.equal((await fileReadHandler({ path: "exact.txt" }, ctx(root)) as { bytes: number }).bytes, 0);
  });
});
test("file replacement between resolution and open is rejected", async () => {
  await workspace(async (root) => {
    const resolved = await resolveReadableFile(root, "src/file.txt");
    await rename(resolved.filename, path.join(root, "src/old.txt")); await writeFile(resolved.filename, "replacement");
    await assert.rejects(readVerifiedFile(resolved.filename, resolved.expected), /identity/);
  });
});
test("final-component symlink replacement cannot be followed", async () => {
  await workspace(async (root) => {
    const resolved = await resolveReadableFile(root, "src/file.txt");
    await rename(resolved.filename, path.join(root, "src/old.txt")); await symlink("old.txt", resolved.filename);
    await assert.rejects(readVerifiedFile(resolved.filename, resolved.expected));
  });
});
test("controlled parent replacement rejects an unexpected descriptor", async () => {
  await workspace(async (root) => {
    const resolved = await resolveReadableFile(root, "src/file.txt");
    await mkdir(path.join(root, "other")); await writeFile(path.join(root, "other/file.txt"), "other file");
    await rename(path.join(root, "src"), path.join(root, "old")); await symlink("other", path.join(root, "src"));
    await assert.rejects(readVerifiedFile(resolved.filename, resolved.expected), /identity/);
  });
});
test("hardlinked files are rejected instead of exposing shared inodes", async () => {
  await workspace(async (root) => {
    await link(path.join(root, "src/file.txt"), path.join(root, "linked.txt"));
    await assert.rejects(fileReadHandler({ path: "linked.txt" }, ctx(root)), /identity/);
  });
});
test("atomic confinement requirement fails closed for local reads and writes", async () => {
  await workspace(async (root) => {
    await assert.rejects(fileReadHandler({ path: "src/file.txt" }, { ...ctx(root), requireAtomicFilesystem: true }), /Atomic rooted/);
    await assert.rejects(fileWriteHandler({ path: "new.txt", content: "data" }, { ...ctx(root), requireAtomicFilesystem: true }), /Atomic rooted/);
    await assert.rejects(lstat(path.join(root, "new.txt")));
  });
});
test("cancelled local file operations do not create or read files", async () => {
  await workspace(async (root) => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fileReadHandler({ path: "src/file.txt" }, { ...ctx(root), signal: controller.signal }));
    await assert.rejects(fileWriteHandler({ path: "new.txt", content: "data" }, { ...ctx(root), signal: controller.signal }));
    await assert.rejects(lstat(path.join(root, "new.txt")));
  });
});
test("abort between incremental reads prevents further reader calls", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(readBoundedFile({ async read(buffer) { calls++; buffer[0] = 65; controller.abort(); return { bytesRead: 1 }; } }, 10, controller.signal));
  assert.equal(calls, 1);
});
test("invalid UTF8 is rejected without modifying file contents", async () => {
  await workspace(async (root) => {
    await writeFile(path.join(root, "invalid.txt"), new Uint8Array([255]));
    await assert.rejects(fileReadHandler({ path: "invalid.txt" }, ctx(root)));
    await rename(path.join(root, "invalid.txt"), path.join(root, "moved.txt"));
    assert.equal((await readFile(path.join(root, "moved.txt"))).length, 1);
  });
});
