import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import type { ProcessFailureKind, ProcessResult, ProcessRunner, ProcessRunOptions } from "@ai-harness/contracts";

export class ProcessExecutionError extends Error {
  constructor(readonly kind: ProcessFailureKind) { super(`Controlled process failed: ${kind}`); }
}

/** Trusted-host primitive, not a model tool. Never invokes a shell. */
export class NodeProcessRunner implements ProcessRunner {
  async run(executable: string, args: readonly string[], timeoutMs: number, options: ProcessRunOptions = {}): Promise<ProcessResult> {
    if (!path.isAbsolute(executable) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
      throw new ProcessExecutionError("start_failed");
    }
    if (options.signal?.aborted) throw new ProcessExecutionError("cancelled");
    if (options.stdinBytes !== undefined && (!(options.stdinBytes instanceof Uint8Array) || options.stdinBytes.byteLength > 6 * 1024 * 1024)) {
      throw new ProcessExecutionError("start_failed");
    }
    const input = options.stdinBytes === undefined ? undefined : Buffer.from(options.stdinBytes);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], {
        shell: false, detached: process.platform !== "win32", windowsHide: true,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        // Preserve the host temp directory: Podman Machine derives its macOS
        // socket identity from it. Never forward ambient provider/runtime options.
        env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: tmpdir() },
      });
      let settled = false;
      let failure: ProcessFailureKind | undefined;
      let bytes = 0;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let killDeadline: ReturnType<typeof setTimeout> | undefined;
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(killDeadline);
        options.signal?.removeEventListener("abort", abort);
        if (failure) reject(new ProcessExecutionError(failure));
        else if (code === null) reject(new ProcessExecutionError("termination_unconfirmed"));
        else resolve({ exitCode: code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
      };
      const stop = (kind: ProcessFailureKind) => {
        if (settled || failure) return;
        failure = kind;
        try {
          if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* close still determines whether termination is confirmed */ }
        killDeadline = setTimeout(() => {
          failure = "termination_unconfirmed";
          child.stdin?.destroy(); child.stdout!.destroy(); child.stderr!.destroy(); child.unref();
          finish(null);
        }, 1000);
      };
      const abort = () => stop("cancelled");
      const deadline = setTimeout(() => stop("timeout"), timeoutMs);
      const capture = (chunks: Buffer[], data: Buffer) => {
        if (failure || settled) return;
        bytes += data.byteLength;
        if (bytes > 4096) { stop("output_limit"); return; }
        chunks.push(Buffer.from(data));
      };
      child.stdout!.on("data", (data: Buffer) => capture(stdout, data));
      child.stderr!.on("data", (data: Buffer) => capture(stderr, data));
      child.stdin?.on("error", () => stop("start_failed"));
      child.on("error", () => { failure ??= "start_failed"; finish(null); });
      child.on("close", (code) => finish(code));
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      if (input !== undefined) child.stdin!.end(input);
    });
  }
}
