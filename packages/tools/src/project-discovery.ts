import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import type { DiscoverySignal, ProjectDiscoveryResult, ValidationUnit } from "@ai-harness/contracts";
import { readBoundedFile } from "./bounded-file.js";
import { engineeringHash } from "./engineering-workspace.js";

export interface DiscoveryDetector {
  id: string; fileNames?: readonly string[]; suffixes?: readonly string[]; language?: string; toolchain?: string;
}
/** Static catalog only; callers may supply additional trusted host detectors. */
export const DEFAULT_DISCOVERY_DETECTORS: readonly DiscoveryDetector[] = Object.freeze([
  { id: "dotnet-project", suffixes: [".csproj", ".fsproj", ".vbproj"], language: "dotnet", toolchain: "dotnet" },
  { id: "dotnet-solution", suffixes: [".sln", ".slnx"], toolchain: "dotnet" },
  { id: "node-package", fileNames: ["package.json"], language: "javascript", toolchain: "node" },
  { id: "pnpm-workspace", fileNames: ["pnpm-workspace.yaml"], toolchain: "pnpm" },
  { id: "java-maven", fileNames: ["pom.xml"], language: "java", toolchain: "maven" },
  { id: "java-gradle", fileNames: ["build.gradle", "build.gradle.kts"], language: "java", toolchain: "gradle" },
  { id: "python-project", fileNames: ["pyproject.toml", "requirements.txt"], language: "python", toolchain: "python" },
  { id: "go-module", fileNames: ["go.mod", "go.work"], language: "go", toolchain: "go" },
  { id: "rust-cargo", fileNames: ["Cargo.toml"], language: "rust", toolchain: "cargo" },
  { id: "php-composer", fileNames: ["composer.json"], language: "php", toolchain: "composer" },
  { id: "ruby-gem", fileNames: ["Gemfile"], language: "ruby", toolchain: "bundler" },
  { id: "cmake-project", fileNames: ["CMakeLists.txt"], language: "cpp", toolchain: "cmake" },
]);
export interface ProjectDiscoveryOptions {
  root: string;
  /** Explicit relative files/directories. Empty string selects this project root, never HOME or /. */
  authorizedPaths: readonly string[];
  maxDepth: number; maxFiles: number; maxFileBytes: number; maxTotalBytes: number; timeoutMs: number;
  detectors?: readonly DiscoveryDetector[];
  signal?: AbortSignal;
}
export class ProjectDiscoveryError extends Error {
  constructor(readonly code: "invalid_scope" | "unsafe_path" | "unreadable" | "timeout" | "cancelled" | "manifest_limit" | "invalid_catalog") { super("Project discovery rejected: " + code); }
}
function relativePath(p: string, empty = false): boolean {
  return empty && p === "" || typeof p === "string" && p.length <= 240 && /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(p) && p.split("/").every(s => s !== "." && s !== ".." && !!s && !s.startsWith("."));
}
function integer(n: number, max: number, zero = false) { if (!Number.isSafeInteger(n) || n < (zero ? 0 : 1) || n > max) throw new ProjectDiscoveryError("invalid_scope"); }
export async function discoverProjects(options: ProjectDiscoveryOptions): Promise<ProjectDiscoveryResult> {
  const o = { ...options, authorizedPaths: [...options.authorizedPaths], detectors: structuredClone(options.detectors ?? DEFAULT_DISCOVERY_DETECTORS) };
  integer(o.maxDepth, 16, true); integer(o.maxFiles, 4096); integer(o.maxFileBytes, 262144); integer(o.maxTotalBytes, 4 * 1024 * 1024); integer(o.timeoutMs, 10000);
  if (!path.isAbsolute(o.root) || o.root === path.parse(o.root).root || o.root === homedir() || !o.authorizedPaths.length || o.authorizedPaths.length > 256 || o.authorizedPaths.some(p => !relativePath(p, true))) throw new ProjectDiscoveryError("invalid_scope");
  if (!o.detectors.length || o.detectors.length > 64 || new Set(o.detectors.map(d => d.id)).size !== o.detectors.length || o.detectors.some(d => !/^[a-z][a-z0-9-]{0,63}$/.test(d.id) || !(d.fileNames?.length || d.suffixes?.length) || [...d.fileNames ?? [], ...d.suffixes ?? []].some(v => typeof v !== "string" || v.length > 64 || /[/\\\0]/.test(v)))) throw new ProjectDiscoveryError("invalid_catalog");
  const deadline = performance.now() + o.timeoutMs, timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), o.timeoutMs);
  const signal = AbortSignal.any([timer.signal, ...(o.signal ? [o.signal] : [])]);
  const check = () => { if (o.signal?.aborted) throw new ProjectDiscoveryError("cancelled"); if (signal.aborted || performance.now() >= deadline) throw new ProjectDiscoveryError("timeout"); };
  const work = async (): Promise<ProjectDiscoveryResult> => {
    check();
    const rootStat = await lstat(o.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(o.root) !== o.root) throw new ProjectDiscoveryError("unsafe_path");
    const scoped = (p: string) => o.authorizedPaths.some(a => a === "" || p === a || p.startsWith(a + "/"));
    const ancestor = (p: string) => scoped(p) || o.authorizedPaths.some(a => a.startsWith(p + "/"));
    const units = new Map<string, DiscoverySignal[]>(), limits = new Set<"depth" | "files" | "bytes">();
    let entries = 0, inspectedFiles = 0, inspectedBytes = 0;
    const walk = async (prefix: string, depth: number): Promise<void> => {
      check(); const directory = await opendir(path.join(o.root, prefix));
      for await (const entry of directory) {
        check(); if (++entries > o.maxFiles) { limits.add("files"); return; }
        const p = prefix ? prefix + "/" + entry.name : entry.name;
        // Private/configuration/generated trees are never read or followed.
        if ([".git", "node_modules", "dist", "vendor", "target", "bin", "obj", ".venv", "harness-development"].includes(entry.name) || entry.name.startsWith(".")) continue;
        if (!ancestor(p)) continue;
        if (!relativePath(p)) throw new ProjectDiscoveryError("unsafe_path");
        const st = await lstat(path.join(o.root, p), { bigint: true }); check();
        if (st.isSymbolicLink()) throw new ProjectDiscoveryError("unsafe_path");
        if (st.isDirectory()) { if (depth >= o.maxDepth) limits.add("depth"); else await walk(p, depth + 1); continue; }
        if (!st.isFile() || st.nlink !== 1n) throw new ProjectDiscoveryError("unsafe_path");
        if (!scoped(p)) continue;
        const detectors = o.detectors.filter(d => d.fileNames?.includes(entry.name) || d.suffixes?.some(s => entry.name.endsWith(s)));
        if (!detectors.length) continue;
        inspectedFiles++;
        if (st.size > BigInt(o.maxFileBytes)) throw new ProjectDiscoveryError("manifest_limit");
        if (inspectedBytes + Number(st.size) > o.maxTotalBytes) { limits.add("bytes"); return; }
        const handle = await open(path.join(o.root, p), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        let text: string;
        try {
          const before = await handle.stat({ bigint: true });
          if (!before.isFile() || before.nlink !== 1n || before.dev !== st.dev || before.ino !== st.ino || before.mtimeNs !== st.mtimeNs || before.ctimeNs !== st.ctimeNs) throw new ProjectDiscoveryError("unsafe_path");
          const bytes = await readBoundedFile(handle, o.maxFileBytes, signal), after = await handle.stat({ bigint: true });
          if (after.nlink !== 1n || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || BigInt(bytes.length) !== before.size) throw new ProjectDiscoveryError("unsafe_path");
          inspectedBytes += bytes.length; text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } finally { await handle.close(); }
        check(); const root = prefix, found = units.get(root) ?? [];
        for (const d of detectors) found.push({ id: d.id, path: p, ...(d.language ? { language: d.language } : {}), ...(d.toolchain ? { toolchain: d.toolchain } : {}) });
        // These are static metadata hints, not executable command selection.
        if (entry.name === "package.json") {
          try {
            const value: unknown = JSON.parse(text);
            if (value && typeof value === "object" && !Array.isArray(value)) {
              const data = value as Record<string, unknown>;
              if (data.workspaces) found.push({ id: "node-workspaces", path: p });
              for (const key of ["dependencies", "devDependencies"]) {
                const deps = data[key];
                if (deps && typeof deps === "object" && !Array.isArray(deps)) for (const name of ["typescript", "react", "next", "vitest", "jest", "mocha", "express"]) if (Object.hasOwn(deps, name)) found.push({ id: "node-" + name, path: p, framework: name });
              }
              const manager = data.packageManager;
              if (typeof manager === "string" && /^[a-z]+@[A-Za-z0-9.+-]{1,48}$/.test(manager)) found.push({ id: "node-package-manager", path: p, toolchain: manager.split("@")[0], version: manager.split("@")[1] });
              const engines = data.engines;
              if (engines && typeof engines === "object" && typeof (engines as Record<string, unknown>).node === "string") {
                const version = (engines as Record<string, string>).node!;
                if (/^[A-Za-z0-9.><=~^| *+-]{1,48}$/.test(version)) found.push({ id: "node-version", path: p, toolchain: "node", version });
              }
            }
          } catch { found.push({ id: "manifest-invalid", path: p }); }
        }
        const marker = entry.name === "go.mod" || entry.name === "go.work" ? /^go\s+([0-9.]{1,24})$/m.exec(text) : entry.name.endsWith(".csproj") ? /<TargetFramework>([A-Za-z0-9.]{1,48})<\/TargetFramework>/.exec(text) : null;
        if (marker) found.push({ id: "toolchain-version", path: p, version: marker[1] });
        if (entry.name === "pyproject.toml") for (const name of ["pytest", "ruff", "mypy", "poetry"]) if (text.includes(name)) found.push({ id: "python-" + name, path: p, framework: name });
        units.set(root, found);
        if (limits.has("files") || limits.has("bytes")) return;
      }
    };
    await walk("", 0); check();
    const result: ValidationUnit[] = [...units].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([root, signals]) => {
      signals.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const ambiguous = signals.some(s => s.id === "manifest-invalid") || signals.some(s => s.id === "java-maven") && signals.some(s => s.id === "java-gradle") || new Set(signals.filter(s => s.id === "dotnet-project").map(s => s.path)).size > 1;
      return { id: engineeringHash(root + JSON.stringify(signals)).slice(0, 32), root, signals, ambiguous };
    });
    return { schemaVersion: 1, units: result, inspectedFiles, inspectedBytes, truncated: limits.size > 0, limitsReached: [...limits].sort() };
  };
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => { abort = () => reject(new ProjectDiscoveryError(o.signal?.aborted ? "cancelled" : "timeout")); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); })]);
  } catch (e) { if (e instanceof ProjectDiscoveryError) throw e; check(); throw new ProjectDiscoveryError("unreadable"); }
  finally { clearTimeout(timeout); if (abort) signal.removeEventListener("abort", abort); }
}
