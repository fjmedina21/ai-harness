import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rmdir } from "node:fs/promises";
import path from "node:path";
import type { DurableDispatchBinding, WorkspaceReceipt, WorkspaceSnapshot } from "@ai-harness/contracts";
import { readVerifiedFile } from "./bounded-file.js";

export const engineeringHash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export function engineeringPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 240 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(raw)) throw new Error("Invalid engineering path");
  const parts = raw.split("/");
  if (parts.some(p => !p || p.startsWith(".") || p.endsWith(".") || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p) || /^(?:node_modules|dist|coverage|vendor|credentials|secrets)$/i.test(p)) ||
      parts.some(p => /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(p)) ||
      /(?:^|\/)(?:id_rsa|id_ed25519)(?:$|\.)|\.(?:pem|key|p12|pfx)$/i.test(raw)) throw new Error("Reserved engineering path");
  return raw;
}
export function engineeringLimit(n: number, maximum: number): void {
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new Error("Invalid engineering limit");
}
export async function engineeringFile(root: string, relative: string, signal?: AbortSignal): Promise<Buffer> {
  engineeringPath(relative);
  let cursor = root;
  const parts = relative.split("/");
  for (let i = 0; i < parts.length; i++) {
    signal?.throwIfAborted();
    cursor = path.join(cursor, parts[i]!);
    const st = await lstat(cursor, { bigint: true });
    if (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile() || st.nlink !== 1n || (st.mode & 0o111n) !== 0n))
      throw new Error("Unsafe engineering file");
  }
  return readVerifiedFile(cursor, await lstat(cursor, { bigint: true }), signal);
}
export async function engineeringCreateTargetAbsent(root: string, relative: string, signal?: AbortSignal): Promise<void> {
  const parts = engineeringPath(relative).split("/"); let cursor = root;
  for (let i = 0; i < parts.length; i++) {
    signal?.throwIfAborted(); cursor = path.join(cursor, parts[i]!);
    try {
      const st = await lstat(cursor);
      if (i === parts.length - 1 || !st.isDirectory() || st.isSymbolicLink()) throw new Error("Create target already exists or unsafe parent");
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
  }
}
export async function writeEngineeringFile(filename: string, bytes: string | Buffer): Promise<void> {
  const handle = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
export class EngineeringWorkspaceUncertain extends Error {
  constructor() { super("Workspace operation uncertain; preserve evidence and inspect journal"); this.name = "EngineeringWorkspaceUncertain"; }
}
export interface WorkspaceOptions {
  /** Already existing canonical 0700 directory, outside the source tree. */
  directory: string;
  sourceRoot: string;
  executionId: string;
  files: readonly string[];
  maxFiles: number;
  maxBytes: number;
  ttlMs: number;
  binding: DurableDispatchBinding;
  createAuthorized: true;
  signal?: AbortSignal;
}

/** Private-copy manager. No execution, Git mutations or automatic cleanup/resume. */
export class EngineeringWorkspace {
  readonly receipt: Readonly<WorkspaceReceipt>;
  private uncertain = false;
  private constructor(receipt: WorkspaceReceipt, private readonly control: string,
    private readonly identity: { dev: bigint; ino: bigint }, private readonly limits: { files: number; bytes: number }) {
    this.receipt = Object.freeze(receipt);
  }
  static async create(options: WorkspaceOptions): Promise<EngineeringWorkspace> {
    const o = { ...options, files: [...options.files] };
    engineeringLimit(o.maxFiles, 256); engineeringLimit(o.maxBytes, 4 * 1024 * 1024); engineeringLimit(o.ttlMs, 86_400_000);
    if (o.createAuthorized !== true || !/^[a-zA-Z0-9-]{1,80}$/.test(o.executionId) || !o.files.length || o.files.length > o.maxFiles) throw new Error("Workspace authorization required");
    if (new Set(o.files.map(p => engineeringPath(p).toLowerCase())).size !== o.files.length) throw new Error("Duplicate source selection");
    const sourceRoot = await realpath(o.sourceRoot), directory = await realpath(o.directory);
    if (directory !== o.directory || sourceRoot !== o.sourceRoot || !path.isAbsolute(directory) ||
        directory === sourceRoot || directory.startsWith(sourceRoot + path.sep) || sourceRoot.startsWith(directory + path.sep)) throw new Error("Workspace roots must be separate canonical paths");
    const st = await lstat(directory);
    if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) throw new Error("Private host directory required");
    o.signal?.throwIfAborted();
    const contents = new Map<string, Buffer>();
    let bytes = 0;
    for (const file of o.files) {
      const data = await engineeringFile(sourceRoot, file, o.signal);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("Binary engineering content rejected");
      bytes += data.length;
      if (bytes > o.maxBytes) throw new Error("Workspace selection exceeds byte budget");
      contents.set(file, data);
    }
    const workspaceId = randomUUID();
    const control = path.join(directory, workspaceId), root = path.join(control, "files");
    const base = snapshot(contents);
    const receipt: WorkspaceReceipt = { executionId: o.executionId, workspaceId, sourceRoot, baseRevision: base.digest, root, expiresAt: Date.now() + o.ttlMs, ownerUid: st.uid };
    const store = o.binding.store;
    let op = store.register({ executionId: o.executionId, taskId: "workspace", requestId: "create",
      projectRoot: directory, toolId: "workspace.create", permission: "files:write", risk: "medium", safety: "side_effecting",
      requester: o.binding.requester, requiresApproval: false, argumentDigest: engineeringHash(JSON.stringify(receipt)) }).operation;
    op = store.prepare(op.operationId, op.version, op.scopeDigest)!;
    if (!op) throw new Error("Workspace creation not authorized");
    op = store.start(op.operationId, op.version);
    try {
      o.signal?.throwIfAborted();
      await mkdir(control, { mode: 0o700 }); await mkdir(root, { mode: 0o700 });
      await writeEngineeringFile(path.join(control, "receipt.json"), JSON.stringify(receipt));
      for (const [file, data] of contents) {
        o.signal?.throwIfAborted();
        await mkdir(path.dirname(path.join(root, file)), { recursive: true, mode: 0o700 });
        await writeEngineeringFile(path.join(root, file), data);
      }
      const identity = await lstat(root, { bigint: true });
      const workspace = new EngineeringWorkspace(receipt, control, identity, { files: o.maxFiles, bytes: o.maxBytes });
      if ((await workspace.inspect(o.signal)).digest !== base.digest) throw new Error("Workspace copy mismatch");
      store.finish(op.operationId, op.version, "Completed", base.digest);
      return workspace;
    } catch {
      try { store.finish(op.operationId, op.version, "Uncertain"); } catch { store.retireSession(); }
      throw new EngineeringWorkspaceUncertain();
    }
  }
  async assertOwned(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const st = await lstat(this.receipt.root, { bigint: true });
    const control = await lstat(this.control);
    if (!control.isDirectory() || control.uid !== this.receipt.ownerUid || (control.mode & 0o777) !== 0o700 ||
        !st.isDirectory() || st.dev !== this.identity.dev || st.ino !== this.identity.ino || Number(st.uid) !== this.receipt.ownerUid || (st.mode & 0o777n) !== 0o700n ||
        await realpath(this.receipt.root) !== this.receipt.root) throw new Error("Workspace ownership mismatch");
    if (this.uncertain || Date.now() >= this.receipt.expiresAt) throw new Error("Workspace uncertain or expired; host review required");
    try { await lstat(path.join(this.control, "uncertain")); throw new Error("Workspace uncertain"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  async inspect(signal?: AbortSignal): Promise<WorkspaceSnapshot> {
    await this.assertOwned(signal);
    const files = new Map<string, Buffer>(); let bytes = 0, entries = 0;
    const walk = async (prefix: string): Promise<void> => {
      for (const name of await readdir(path.join(this.receipt.root, prefix))) {
        signal?.throwIfAborted();
        if (++entries > this.limits.files * 16) throw new Error("Workspace inventory limit");
        const relative = engineeringPath(prefix ? prefix + "/" + name : name);
        const st = await lstat(path.join(this.receipt.root, relative));
        if (st.isDirectory() && !st.isSymbolicLink()) await walk(relative);
        else {
          const data = await engineeringFile(this.receipt.root, relative, signal);
          bytes += data.length; files.set(relative, data);
          if (files.size > this.limits.files || bytes > this.limits.bytes) throw new Error("Workspace inventory limit");
        }
      }
    };
    await walk(""); await this.assertOwned(signal);
    return snapshot(files);
  }
  async checkCreate(relative: string, signal?: AbortSignal): Promise<void> {
    await this.assertOwned(signal); await engineeringCreateTargetAbsent(this.receipt.root, relative, signal);
  }
  async read(relative: string, signal?: AbortSignal): Promise<string> {
    await this.assertOwned(signal);
    const data = await engineeringFile(this.receipt.root, relative, signal);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("Binary engineering content rejected");
    return text;
  }
  /** Host patch engine only. A stale lock intentionally blocks later mutations. */
  async mutate<T>(effect: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.assertOwned(signal);
    const lock = path.join(this.control, "mutation.lock");
    await mkdir(lock, { mode: 0o700 });
    try {
      await this.assertOwned(signal);
      const result = await effect();
      signal?.throwIfAborted();
      await rmdir(lock);
      return result;
    } catch {
      this.uncertain = true;
      try { await writeEngineeringFile(path.join(this.control, "uncertain"), "Host reconciliation required"); } catch { /* Lock remains as crash evidence. */ }
      throw new EngineeringWorkspaceUncertain();
    }
  }
}
function snapshot(contents: Map<string, Buffer>): WorkspaceSnapshot {
  const files = [...contents].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, data]) => ({ path: file, hash: engineeringHash(data), bytes: data.length }));
  return { digest: engineeringHash(JSON.stringify(files)), files };
}
