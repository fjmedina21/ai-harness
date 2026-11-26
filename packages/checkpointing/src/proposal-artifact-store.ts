import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants, closeSync, fsyncSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalProposalJson, EngineeringResumeError, type ProposalArtifact } from "@ai-harness/contracts";

const digest = (value: unknown) => createHash("sha256").update(canonicalProposalJson(value)).digest("hex");
const check = (ok: unknown): void => { if (!ok) throw new EngineeringResumeError("artifact_invalid"); };
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9-]{1,80}$/.test(v);
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function exact(value: object, keys: string[]): void { check(Object.keys(value).sort().join() === keys.sort().join()); }
/** Bounds/schema admission; the independent PatchEngine revalidates all executable patch semantics. */
function validate(a: ProposalArtifact): void {
  check(a && typeof a === "object");
  exact(a, ["schemaVersion", "executionId", "requester", "operationId", "workspaceId", "receipt", "rootIdentity", "sourceRevision", "baseSnapshot", "patch", "patchDigest", "diffDigest", "diff", "allowedPaths", "allowedOperations", "policy", "policyDigest", "policyEncoding", "budget", "accounting", "createdAt", "expiresAt", "artifactDigest", ...(a.projectAuthorizationDigest === undefined ? [] : ["projectAuthorizationDigest"]), ...(a.repairContext === undefined ? [] : ["repairContext"])]);
  check(a.projectAuthorizationDigest === undefined || hash(a.projectAuthorizationDigest));
  if (a.repairContext !== undefined) {
    const r = a.repairContext;
    exact(r, ["sessionId", "iterationId", "parentOperationId", "profileDigest", "repairPolicyDigest", "originalSnapshot"]);
    check(id(r.sessionId) && id(r.iterationId) && hash(r.parentOperationId) && hash(r.profileDigest) && hash(r.repairPolicyDigest));
    exact(r.originalSnapshot, ["digest", "files"]);
    check(r.originalSnapshot.digest === a.sourceRevision && Array.isArray(r.originalSnapshot.files) && r.originalSnapshot.files.length <= 256);
    for (const f of r.originalSnapshot.files) { exact(f, ["path", "hash", "bytes"]); check(typeof f.path === "string" && f.path.length <= 240 && hash(f.hash) && Number.isSafeInteger(f.bytes) && f.bytes >= 0); }
    check(createHash("sha256").update(JSON.stringify(r.originalSnapshot.files.map(f => ({ path: f.path, hash: f.hash, bytes: f.bytes })))).digest("hex") === r.originalSnapshot.digest);
  }
  check(a.schemaVersion === 1 && id(a.executionId) && id(a.workspaceId) && hash(a.operationId));
  check(a.requester && typeof a.requester.issuer === "string" && typeof a.requester.subject === "string");
  exact(a.requester, ["issuer", "subject"]);
  check([a.requester.issuer, a.requester.subject].every(s => /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(s)));
  for (const value of [a.patchDigest, a.diffDigest, a.policyDigest, a.sourceRevision, a.artifactDigest, a.baseSnapshot?.digest]) check(hash(value));
  check(typeof a.diff === "string" && Buffer.byteLength(JSON.stringify({ diff: a.diff })) <= 16_000 && createHash("sha256").update(a.diff).digest("hex") === a.diffDigest);
  check(typeof a.policyEncoding === "string" && Buffer.byteLength(a.policyEncoding) <= 8192 && createHash("sha256").update(a.policyEncoding).digest("hex") === a.policyDigest);
  check(canonicalProposalJson(JSON.parse(a.policyEncoding)) === canonicalProposalJson(a.policy));
  check(a.patch && a.patch.digest === a.patchDigest && a.patch.executionId === a.executionId && a.patch.workspaceId === a.workspaceId && a.patch.policyDigest === a.policyDigest && a.patch.baseRevision === a.baseSnapshot.digest);
  check(a.receipt && a.receipt.executionId === a.executionId && a.receipt.workspaceId === a.workspaceId && a.receipt.baseRevision === a.sourceRevision);
  exact(a.receipt, ["executionId", "workspaceId", "sourceRoot", "baseRevision", "root", "expiresAt", "ownerUid"]);
  check(path.isAbsolute(a.receipt.root) && path.isAbsolute(a.receipt.sourceRoot) && a.receipt.root.length <= 1024 && a.receipt.sourceRoot.length <= 1024);
  check(Number.isSafeInteger(a.receipt.ownerUid) && Number.isSafeInteger(a.receipt.expiresAt));
  check(a.rootIdentity && /^\d{1,32}$/.test(a.rootIdentity.dev) && /^\d{1,32}$/.test(a.rootIdentity.ino));
  exact(a.rootIdentity, ["dev", "ino"]);
  check(date(a.createdAt) && date(a.expiresAt) && Date.parse(a.createdAt) < Date.parse(a.expiresAt) && Date.parse(a.expiresAt) <= a.receipt.expiresAt);
  exact(a.patch, ["executionId", "workspaceId", "baseRevision", "policyDigest", "digest", "changes", "status"]);
  check(Array.isArray(a.patch.changes) && a.patch.changes.length <= 16);
  for (const change of a.patch.changes) exact(change, ["path", "operation", "baseHash", "content", "resultHash"]);
  exact(a.policy, ["version", "allowedPaths", "allowedOperations", "maxFiles", "maxBytes"]);
  exact(a.budget, ["maxIterations", "maxRequests", "maxTokens", "maxEstimatedCostUsd", "timeoutMs", "maxFiles", "maxBytes"]);
  exact(a.accounting, ["requests", "tokens", "estimatedCostUsd", "usageComplete", "reportedUsage", "cost"]);
  check(Object.keys(a.accounting.reportedUsage).every(k => ["availability", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"].includes(k)));
  check(Object.keys(a.accounting.cost).every(k => ["status", "reason", "knownAmount", "currency", "amount", "rateVersions"].includes(k)));
  check(a.policy && a.policy.version.length <= 80 && a.policy.allowedPaths.length <= 256 && a.policy.allowedOperations.length <= 3);
  check(canonicalProposalJson(a.allowedPaths) === canonicalProposalJson(a.policy.allowedPaths) && canonicalProposalJson(a.allowedOperations) === canonicalProposalJson(a.policy.allowedOperations));
  check(Array.isArray(a.baseSnapshot.files) && a.baseSnapshot.files.length <= 256);
  for (const f of a.baseSnapshot.files) { exact(f, ["path", "hash", "bytes"]); check(typeof f.path === "string" && f.path.length <= 240 && hash(f.hash) && Number.isSafeInteger(f.bytes) && f.bytes >= 0); }
  check(Buffer.byteLength(JSON.stringify(a.patch)) <= 12_000);
  check(a.budget && a.accounting && Object.values(a.budget).every(n => Number.isFinite(n) && n >= 0));
  check(Number.isSafeInteger(a.accounting.requests) && a.accounting.requests >= 0 && a.accounting.requests <= a.budget.maxRequests && Number.isSafeInteger(a.accounting.tokens) && a.accounting.tokens >= 0 && a.accounting.tokens <= a.budget.maxTokens);
  check(a.accounting.estimatedCostUsd === null || Number.isFinite(a.accounting.estimatedCostUsd) && a.accounting.estimatedCostUsd >= 0);
  check(typeof a.accounting.usageComplete === "boolean" && a.accounting.reportedUsage && a.accounting.cost);
  const { artifactDigest, ...unsigned } = a;
  check(digest(unsigned) === artifactDigest);
}
export function sealProposalArtifact(input: Omit<ProposalArtifact, "artifactDigest">): ProposalArtifact {
  const artifact = { ...structuredClone(input), artifactDigest: digest(input) };
  validate(artifact); return artifact;
}
/** Host-owned private local storage. Content hashes identify data; host HMAC authenticates the manifest.
 * Same-UID malicious process/root compromise is outside this boundary. Never log content/raw IO errors.
 */
export class ProposalArtifactStore {
  private readonly directory: string;
  private readonly key: Buffer;
  constructor(private readonly hostRoot: string, create = true) {
    try {
      this.privateDirectory(hostRoot);
      this.directory = path.join(hostRoot, "proposals");
      if (create) { try { mkdirSync(this.directory, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; } }
      this.privateDirectory(this.directory);
      const keyFile = path.join(hostRoot, "proposal-host.key");
      if (create) {
        try {
          // Losing the host key never silently creates replacement authority for existing artifacts.
          try { lstatSync(keyFile); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") check(readdirSync(this.directory).length === 0); else throw e; }
          const fd = openSync(keyFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
          try { writeFileSync(fd, randomBytes(32)); fsyncSync(fd); } finally { closeSync(fd); }
          this.syncDirectory(hostRoot);
        } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      }
      this.key = this.readPrivate(keyFile, 32); check(this.key.length === 32);
    } catch { throw new EngineeringResumeError("artifact_invalid"); }
  }
  private privateDirectory(directory: string): void {
    const st = lstatSync(directory);
    check(path.isAbsolute(directory) && realpathSync(directory) === directory && st.isDirectory() && st.uid === process.getuid?.() && (st.mode & 0o777) === 0o700);
  }
  private syncDirectory(directory: string): void { const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
  private readPrivate(filename: string, maximum: number): Buffer {
    const st = lstatSync(filename, { bigint: true });
    check(st.isFile() && st.nlink === 1n && Number(st.uid) === process.getuid?.() && (st.mode & 0o777n) === 0o600n && st.size <= BigInt(maximum));
    const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd, { bigint: true }); check(before.ino === st.ino && before.dev === st.dev && before.ctimeNs === st.ctimeNs);
      const buffer = Buffer.alloc(maximum + 1); let size = 0, n: number;
      do { n = readSync(fd, buffer, size, buffer.length - size, size); size += n; } while (n && size < buffer.length);
      const after = fstatSync(fd, { bigint: true });
      check(size <= maximum && BigInt(size) === before.size && after.size === before.size && after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs && after.nlink === 1n);
      return buffer.subarray(0, size);
    } finally { closeSync(fd); }
  }
  private file(artifactDigest: string): string { check(hash(artifactDigest)); return path.join(this.directory, artifactDigest + ".json"); }
  private outsideProject(a: ProposalArtifact): void {
    check(this.hostRoot !== a.receipt.sourceRoot && !this.hostRoot.startsWith(a.receipt.sourceRoot + path.sep) && !a.receipt.sourceRoot.startsWith(this.hostRoot + path.sep));
    check(!this.hostRoot.startsWith(a.receipt.root + path.sep));
  }
  put(artifact: ProposalArtifact): void {
    let temporary: string | undefined;
    try {
      validate(artifact); this.outsideProject(artifact); this.privateDirectory(this.directory);
      check(readdirSync(this.directory).length < 10_000); // Bounded retention; no implicit eviction of evidence.
      const text = canonicalProposalJson(artifact), mac = createHmac("sha256", this.key).update(text).digest("hex");
      const envelope = canonicalProposalJson({ artifact, mac });
      temporary = path.join(this.directory, ".pending-" + randomUUID());
      const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, envelope); fsyncSync(fd); } finally { closeSync(fd); }
      // Exclusive publish, never replace an existing artifact. An interruption preserves orphan evidence.
      linkSync(temporary, this.file(artifact.artifactDigest)); unlinkSync(temporary); temporary = undefined;
      this.syncDirectory(this.directory);
      this.get(artifact.artifactDigest);
    } catch { throw new EngineeringResumeError("artifact_invalid"); }
    // A failed temporary publication is deliberately retained for explicit host reconciliation.
  }
  get(artifactDigest: string): ProposalArtifact {
    try {
      this.privateDirectory(this.directory);
      const text = this.readPrivate(this.file(artifactDigest), 65536).toString("utf8");
      const envelope = JSON.parse(text) as { artifact: ProposalArtifact; mac: string };
      exact(envelope, ["artifact", "mac"]); check(hash(envelope.mac));
      const expected = createHmac("sha256", this.key).update(canonicalProposalJson(envelope.artifact)).digest();
      check(timingSafeEqual(expected, Buffer.from(envelope.mac, "hex")));
      validate(envelope.artifact); check(envelope.artifact.artifactDigest === artifactDigest); this.outsideProject(envelope.artifact);
      return structuredClone(envelope.artifact);
    } catch (e) { throw new EngineeringResumeError((e as NodeJS.ErrnoException).code === "ENOENT" ? "artifact_missing" : "artifact_invalid"); }
  }
}
