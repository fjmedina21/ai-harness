import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { normalizeApprovalPolicy, type ApprovalPolicy, type EngineeringPolicy } from "@ai-harness/contracts";
import {
  GitHubAuthentication,
  GitHubAuthError,
  GitHubOAuthClient,
  validateGitHubAuthPolicy,
  type GitHubAuthPolicy,
  type GitHubCredentialStore,
} from "@ai-harness/security";

export interface OperationalWorkspace {
  approval?: ApprovalPolicy;
  sourceRoot: string;
  workspaceDirectory: string;
  journalFile: string;
  checkpointDirectory: string;
  policy: EngineeringPolicy;
}
export interface GitHubHostConfiguration {
  approval?: ApprovalPolicy;
  version: 1;
  auth: GitHubAuthPolicy;
  workspaces: readonly OperationalWorkspace[];
}
export interface GitHubHost {
  configuration: GitHubHostConfiguration;
  authentication: GitHubAuthentication;
}
function fail(code: string): never {
  throw new GitHubAuthError(code);
}

/** Private host profile at a fixed OS-user path; never .ai, cwd, or environment. */
export async function readGitHubHostConfiguration(
  filename = path.join(homedir(), ".config", "ai-harness", "github-auth.json"),
): Promise<GitHubHostConfiguration> {
  try {
    const directory = path.dirname(filename),
      parent = await lstat(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== process.getuid?.() ||
      (parent.mode & 0o777) !== 0o700 ||
      (await realpath(directory)) !== directory
    )
      fail("invalid_host_configuration");
    const handle = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let p: GitHubHostConfiguration;
    try {
      const before = await handle.stat();
      if (
        !before.isFile() ||
        before.nlink !== 1 ||
        before.uid !== process.getuid?.() ||
        (before.mode & 0o777) !== 0o600 ||
        before.size > 65536
      )
        fail("invalid_host_configuration");
      const bytes = Buffer.alloc(before.size + 1);
      const read = await handle.read(bytes, 0, bytes.length, 0),
        after = await handle.stat();
      if (
        read.bytesRead !== before.size ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        fail("invalid_host_configuration");
      p = JSON.parse(bytes.subarray(0, read.bytesRead).toString("utf8"));
    } finally {
      await handle.close();
    }
    if (
      !p ||
      p.version !== 1 ||
      Object.keys(p).some(
        (k) => !["version", "auth", "workspaces", "approval"].includes(k),
      ) ||
      !Array.isArray(p.workspaces) ||
      p.workspaces.length > 32
    )
      fail("invalid_host_configuration");
    p.auth = validateGitHubAuthPolicy(p.auth);
    if (p.approval !== undefined) p.approval = normalizeApprovalPolicy(p.approval);
    const unique = new Set<string>();
    for (const w of p.workspaces) {
      if (
        !w ||
        Object.keys(w).some(
          (k) =>
            ![
              "sourceRoot",
              "workspaceDirectory",
              "journalFile",
              "checkpointDirectory",
              "policy",
              "approval",
            ].includes(k),
        ) ||
        !w.policy ||
        !Array.isArray(w.policy.allowedPaths) ||
        !Array.isArray(w.policy.allowedOperations)
      )
        fail("invalid_host_configuration");
      if (w.approval !== undefined) w.approval = normalizeApprovalPolicy(w.approval);
      for (const directory of [
        w.sourceRoot,
        w.workspaceDirectory,
        w.checkpointDirectory,
        path.dirname(w.journalFile),
      ]) {
        if (
          !path.isAbsolute(directory) ||
          (await realpath(directory)) !== directory
        )
          fail("invalid_host_configuration");
      }
      for (const directory of [
        w.workspaceDirectory,
        w.checkpointDirectory,
        path.dirname(w.journalFile),
      ]) {
        const info = await lstat(directory);
        if (
          info.uid !== process.getuid?.() ||
          (info.mode & 0o777) !== 0o700 ||
          directory === w.sourceRoot ||
          directory.startsWith(w.sourceRoot + path.sep) ||
          w.sourceRoot.startsWith(directory + path.sep)
        )
          fail("invalid_host_configuration");
      }
      if (
        path.resolve(w.journalFile) !== w.journalFile ||
        unique.has(w.journalFile)
      )
        fail("invalid_host_configuration");
      unique.add(w.journalFile);
    }
    for (const a of p.auth.assignments)
      for (const r of a.resources)
        if (
          !p.workspaces.some(
            (w) =>
              r.sourceRoot === w.sourceRoot &&
              r.workspaceDirectory === w.workspaceDirectory,
          )
        )
          fail("invalid_host_configuration");
    return p;
  } catch (e) {
    if (e instanceof GitHubAuthError) throw e;
    return fail("authentication_required");
  }
}

interface CommandResult {
  code: number;
  stdout: string;
}
/** Credentials pass through stdin/captured stdout, never argv or inherited logs. */
async function keychainCommand(
  args: string[],
  input?: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", HOME: homedir() },
      shell: false,
    });
    let size = 0,
      stdout = "",
      ended = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, 10000);
    const finish = (code?: number) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      code === undefined
        ? reject(new GitHubAuthError("credential_store_unavailable"))
        : resolve({ code, stdout });
    };
    child.on("error", () => finish());
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        child.kill("SIGKILL");
        finish();
      } else stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        child.kill("SIGKILL");
        finish();
      }
    });
    child.on("close", (code) => finish(code ?? undefined));
    child.stdin.end(input);
  });
}
export const githubKeychainService = (clientId: string): string =>
  "ai-harness.github." +
  createHash("sha256").update(clientId).digest("hex").slice(0, 32);

/** macOS adapter. Other platforms require a reviewed native adapter and fail closed. */
export class MacOSGitHubCredentialStore implements GitHubCredentialStore {
  private readonly service: string;
  constructor(
    clientId: string,
    private readonly directory = path.join(homedir(), ".config", "ai-harness"),
  ) {
    if (process.platform !== "darwin") fail("credential_store_unsupported");
    this.service = githubKeychainService(clientId);
  }
  async read(name: "session" | "client-secret"): Promise<string | null> {
    const result = await keychainCommand([
      "find-generic-password",
      "-a",
      name,
      "-s",
      this.service,
      "-w",
    ]);
    if (result.code === 44) return null;
    if (result.code !== 0) fail("credential_store_unavailable");
    const raw = result.stdout.trim();
    if (name === "client-secret") return raw;
    if (!/^[A-Za-z0-9_-]{1,24000}$/.test(raw)) fail("invalid_session");
    return Buffer.from(raw, "base64url").toString("utf8");
  }
  async writeSession(value: string): Promise<void> {
    if (Buffer.byteLength(value) > 16384) fail("invalid_session");
    const encoded = Buffer.from(value).toString("base64url");
    // security interactive mode reads command from stdin. The alphabet cannot escape it.
    const command = `add-generic-password -U -a session -s ${this.service} -w ${encoded}\n`;
    if (Buffer.byteLength(command) >= 4096) fail("credential_store_limit");
    const result = await keychainCommand(["-i"], command);
    if (result.code !== 0 || (await this.read("session")) !== value)
      fail("credential_store_unavailable");
  }
  async clearSession(): Promise<void> {
    const result = await keychainCommand([
      "delete-generic-password",
      "-a",
      "session",
      "-s",
      this.service,
    ]);
    if (![0, 44].includes(result.code)) fail("credential_store_unavailable");
  }
  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const lock = path.join(this.directory, "github-auth.lock");
    let handle;
    try {
      handle = await open(
        lock,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch {
      return fail("authentication_busy");
    }
    try {
      await handle.writeFile(
        "Authentication operation in progress; stale locks require host inspection.\n",
      );
      await handle.sync();
      return await action();
    } finally {
      await handle.close();
      await unlink(lock);
    }
  }
}

export async function loadGitHubHost(): Promise<GitHubHost> {
  const configuration = await readGitHubHostConfiguration();
  return {
    configuration,
    authentication: new GitHubAuthentication(
      new GitHubOAuthClient(configuration.auth),
      new MacOSGitHubCredentialStore(configuration.auth.clientId),
    ),
  };
}

export async function openGitHubBrowser(url: string): Promise<void> {
  if (process.platform !== "darwin") fail("browser_unavailable");
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://github.com" ||
    parsed.pathname !== "/login/oauth/authorize"
  )
    fail("invalid_endpoint");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/open", [url], {
      stdio: "ignore",
      shell: false,
      env: { PATH: "/usr/bin:/bin", HOME: homedir() },
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GitHubAuthError("browser_unavailable"));
    }, 5000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new GitHubAuthError("browser_unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new GitHubAuthError("browser_unavailable"));
    });
  });
}

export async function authCommand(
  args: string[],
  output: (text: string) => void,
  signal?: AbortSignal,
  load: () => Promise<GitHubHost> = loadGitHubHost,
  browser = openGitHubBrowser,
): Promise<number> {
  try {
    const [command, ...flags] = args;
    if (
      !["login", "whoami", "status", "logout", "refresh"].includes(
        command ?? "",
      ) ||
      flags.length > 1 ||
      (flags.length === 1 && flags[0] !== "--json")
    )
      fail("invalid_arguments");
    const { authentication: auth, configuration } = await load();
    if (command === "logout") {
      await auth.logout(signal);
      output(
        JSON.stringify({
          authenticated: false,
          localSession: "cleared",
          accessCredential: "revoked_or_invalid",
          refreshCredential: "removed_locally_remote_revocation_unverified",
        }),
      );
      return 0;
    }
    const identity =
      command === "login"
        ? await auth.login(browser, signal)
        : command === "refresh"
          ? await auth.refresh(signal)
          : await auth.identity(signal);
    const assignments = configuration.auth.assignments
      .filter((a) => a.accountId === identity.subject)
      .map((a) => ({ roles: a.roles, resources: a.resources }));
    output(
      JSON.stringify({
        authenticated: true,
        username: identity.login,
        accountId: identity.subject,
        issuer: identity.issuer,
        expiresAt: new Date(identity.expiresAt).toISOString(),
        assignments,
      }),
    );
    return 0;
  } catch (e) {
    output(
      JSON.stringify({
        authenticated: false,
        error: {
          code: signal?.aborted
            ? "cancelled"
            : e instanceof GitHubAuthError
              ? e.code
              : "authentication_required",
          message: e instanceof GitHubAuthError && e.code === "github_unavailable"
            ? "GitHub verification unavailable; protected operations remain blocked"
            : "Authentication failed; inspect trusted GitHub App configuration and protected credential storage",
        },
      }),
    );
    return 1;
  }
}
