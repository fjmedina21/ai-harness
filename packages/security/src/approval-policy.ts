import { createHash, randomBytes } from "node:crypto";
import { approvalPolicyJson, canonicalProposalJson, normalizeApprovalPolicy, type ApprovalPolicy, type ApprovalReviewContext, type DurableApproval, type HostIdentity, type HumanIntentReceipt, type HumanApprovalPort, type HumanApprovalReview } from "@ai-harness/contracts";
const verifiedReceipts = new WeakMap<object, string>();
/** Host-only presence verifier capability. A JSON object/model claim is not one.
 * External implementations must independently verify authenticated human intent. */
export interface HumanPresenceVerifier {
  method: HumanIntentReceipt["method"];
  verify(review: Readonly<HumanApprovalReview>, signal: AbortSignal): Promise<boolean>;
}
/** Issues non-serializable in-process authority only after the trusted UI verifier.
 * Persisted receipts are metadata; the SQLite host port is not authentication. */
export class HumanApprovalAuthority implements HumanApprovalPort {
  constructor(private readonly verifier: HumanPresenceVerifier) {}
  async confirm(input: Readonly<HumanApprovalReview>, cancellation?: AbortSignal): Promise<HumanIntentReceipt | null> {
    const review = structuredClone(input), binding = humanIntentDigest(review.context, review.actor);
    const remaining = Math.min(60000, Date.parse(review.context.expiresAt) - Date.now());
    if (remaining <= 0) return null;
    const signal = cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(remaining)]) : AbortSignal.timeout(remaining);
    let aborted!: () => void;
    let approved: boolean;
    try {
      signal.throwIfAborted();
      approved = await Promise.race([this.verifier.verify(structuredClone(review), signal), new Promise<false>(resolve => { aborted = () => resolve(false); signal.addEventListener("abort", aborted, { once: true }); if (signal.aborted) aborted(); })]);
    } finally { if (aborted) signal.removeEventListener("abort", aborted); }
    if (!approved || signal.aborted) return null;
    const now = Date.now();
    const receipt: HumanIntentReceipt = Object.freeze({ id: randomBytes(32).toString("hex"), bindingDigest: binding, issuedAt: now,
      expiresAt: Math.min(now + 60000, Date.parse(review.context.expiresAt)), method: this.verifier.method });
    verifiedReceipts.set(receipt, binding); return receipt;
  }
}
export const approvalPolicyDigest = (p?: ApprovalPolicy): string => createHash("sha256").update(approvalPolicyJson(p)).digest("hex");
export const humanIntentDigest = (review: ApprovalReviewContext, actor: HostIdentity): string => createHash("sha256").update(canonicalProposalJson({ review, actor: { issuer: actor.issuer, subject: actor.subject } })).digest("hex");
export function assertHumanIntent(receipt: HumanIntentReceipt | undefined, context: ApprovalReviewContext, actor: HostIdentity, now = Date.now()): asserts receipt is HumanIntentReceipt {
  if (!receipt || verifiedReceipts.get(receipt) !== humanIntentDigest(context, actor) || Object.keys(receipt).sort().join() !== ["id", "bindingDigest", "issuedAt", "expiresAt", "method"].sort().join() || !/^[a-f0-9]{64}$/.test(receipt.id) || receipt.bindingDigest !== humanIntentDigest(context, actor) ||
    !["macos-local-auth-and-tty-v1", "reviewed-external-v1"].includes(receipt.method) || !Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.issuedAt > now || receipt.issuedAt < now - 60000 || receipt.expiresAt <= now || receipt.expiresAt > receipt.issuedAt + 60000 || receipt.expiresAt > Date.parse(context.expiresAt)) throw new Error("Verified human confirmation required");
}
/** Rechecks the existing grant; never creates authority from a mode or session alone. */
export function assertApprovalDecision(grant: DurableApproval, context?: ApprovalReviewContext | null, currentPolicy?: ApprovalPolicy): void {
  normalizeApprovalPolicy(currentPolicy);
  if (!grant.approver || !context || context.policy.mode !== "personal" || context.policyDigest !== approvalPolicyDigest(currentPolicy)) throw new Error("Personal approval context required; legacy authority is inactive");
  const decision = grant.decision;
  if (grant.approver.issuer !== grant.requester.issuer || grant.approver.subject !== grant.requester.subject ||
    !decision || decision.mode !== "personal" || decision.policyDigest !== context.policyDigest || decision.authorizationScope !== context.scopeDigest ||
    decision.patchDigest !== context.patchDigest || decision.snapshotDigest !== context.snapshotDigest || decision.challengeDigest !== createHash("sha256").update(context.challenge).digest("hex") || decision.workspaceId !== context.workspaceId || !decision.intent ||
    decision.intent.bindingDigest !== humanIntentDigest(context, grant.approver) || decision.approver.issuer !== grant.approver.issuer || decision.approver.subject !== grant.approver.subject) throw new Error("Reviewed owner Personal approval required");
}
