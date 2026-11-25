import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { EngineeringResumeError, type HumanApprovalPort, type HumanApprovalReview } from "@ai-harness/contracts";
import { humanIntentDigest, HumanApprovalAuthority } from "@ai-harness/security";

/** Fixed trusted host code. No project/model strings are interpolated into the program. */
export const MACOS_HUMAN_AUTHENTICATION = String.raw`
ObjC.import('Foundation'); ObjC.import('LocalAuthentication');
function run(argv) {
  if (argv.length !== 1 || argv[0].length > 512) return 'denied';
  var context = $.LAContext.alloc.init;
  context.touchIDAuthenticationAllowableReuseDuration = 0;
  var available = context.canEvaluatePolicyError($.LAPolicyDeviceOwnerAuthentication, null);
  if (!available) return 'denied';
  var complete = false, approved = false;
  context.evaluatePolicyLocalizedReasonReply($.LAPolicyDeviceOwnerAuthentication, argv[0], function(success, error) { approved = !!success; complete = true; });
  var end = Date.now() + 55000;
  while (!complete && Date.now() < end) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
  context.invalidate;
  return complete && approved ? 'confirmed' : 'denied';
}
`;
const safeDisplay = (s: string) => stripVTControlCharacters(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "");
/** JSON-quoted lines preserve every byte-relevant escape rather than deleting controls. */
export const exactReviewDisplay = (diff: string): string => diff.split("\n").map(line => JSON.stringify(line).replace(/[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).join("\n");
/** A TTY is necessary, not sufficient. macOS device-owner authentication supplies
 * a second presence check; neither piped APPROVE nor a PTY alone can approve. */
export async function authenticateLocalHuman(reason: string, signal: AbortSignal): Promise<boolean> {
  if (process.platform !== "darwin" || !process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY) throw new EngineeringResumeError("human_confirmation_required");
  signal.throwIfAborted();
  return new Promise<boolean>((resolve) => {
    const child = spawn("/usr/bin/osascript", ["-l", "JavaScript", "-", reason], { shell: false, stdio: ["pipe", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" } });
    let output = "", size = 0, settled = false;
    const finish = (result: boolean) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(result); };
    const abort = () => { child.kill("SIGKILL"); finish(false); };
    const timer = setTimeout(abort, 60000);
    child.stdout.on("data", b => { size += b.length; if (size > 1024) abort(); else output += String(b); });
    child.stderr.on("data", b => { size += b.length; if (size > 1024) abort(); });
    child.once("error", () => { abort(); }); child.stdin.on("error", () => abort());
    child.once("close", code => finish(code === 0 && output.trim() === "confirmed"));
    signal.addEventListener("abort", abort, { once: true }); child.stdin.end(MACOS_HUMAN_AUTHENTICATION);
    if (signal.aborted) abort();
  });
}
export function createInteractiveApprovalPort(): HumanApprovalPort {
  return new HumanApprovalAuthority({ method: "macos-local-auth-and-tty-v1", async verify(review: Readonly<HumanApprovalReview>, cancellation: AbortSignal) {
    if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY || process.platform !== "darwin") throw new EngineeringResumeError("human_confirmation_required");
    const remaining = Math.min(60000, Date.parse(review.context.expiresAt) - Date.now());
    if (remaining <= 0) throw new EngineeringResumeError("approval_expired");
    const timeout = AbortSignal.timeout(remaining), signal = cancellation ? AbortSignal.any([timeout, cancellation]) : timeout;
    const requestDigest = humanIntentDigest(review.context, review.actor);
    process.stderr.write(safeDisplay(`AI Harness — ${review.context.purpose === "patch.apply" ? "Patch" : "Sandbox"} Approval\nExecution: ${review.context.executionId}\nMode: Personal\nGitHub account: ${review.actor.subject}\nProject: ${review.project ?? "host-bound proposal"}\nWorkspace: ${review.workspace}\nSnapshot: ${review.context.snapshotDigest}\nPolicy: v${review.context.policy.version} ${review.context.policyDigest}\nRisk: ${review.risk}\nPatch: ${review.context.patchDigest}\nChallenge binding: ${requestDigest}\nExpires: ${review.context.expiresAt}\nFiles: ${review.files.map(f => f.operation + " " + f.path).join(", ")}\n\nExact review (each line JSON-quoted):\n${exactReviewDisplay(review.diff)}\n\n`));
    const terminal = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    let bytes = 0; const bound = (b: Buffer) => { bytes += b.length; if (bytes > 256) terminal.close(); };
    process.stdin.on("data", bound);
    let answer: string;
    try { answer = await terminal.question("Approve this exact operation? Type APPROVE to confirm: ", { signal }); }
    catch { return false; }
    finally { process.stdin.removeListener("data", bound); terminal.close(); }
    if (answer !== "APPROVE" || signal.aborted) return false;
    const present = await authenticateLocalHuman(`Aprobar ${review.context.purpose}: ${requestDigest}`, signal);
    return present && !signal.aborted;
  } });
}
