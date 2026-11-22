# Phase 7 security and privacy

Telemetry is opt-in host diagnostics, not authorization, approval, durable
operation state, recovery evidence or a new source of authority. Providers do
not receive journal access. Default Deny, single-use transactional approvals,
conservative recovery and explicit Podman isolation remain unchanged.

The collector reconstructs events from a closed schema and allowlist. It omits
free-form error text, prompts, model output, file contents, tool inputs/results,
credentials, environment values, approval identities and approval IDs. Host
labels are bounded; unrecognized tools are redacted. Event queues, spans,
traces, metric cardinality, output records and local files are bounded. Invalid
and discarded events, sink errors and timeouts are exposed in diagnostics.

The JSONL sink requires an already-created owner-only directory and owner-only
regular single-link files; it uses no-follow opens, size bounds and retention
rotation. It supports one writer only. Filesystem checks do not defend against
malicious same-user races, compromised host code or power loss. The memory sink
also validates and bounds sanitized records.

Sink failures are counted and stop delivery; they do not change policy or
handler results. A JavaScript timeout cannot preempt synchronous host callbacks.
Telemetry may be dropped on process interruption and has no exactly-once,
tamper-proof or durability guarantee. Never use it instead of the SQLite
authorization journal.

Evaluation scenarios/assertions are authored by trusted host code. Reports
accept only bounded scalar facts and metrics, sanitize errors and do not contain
payloads. Security results are never model-judged. Nineteen deterministic
fixtures establish only the listed cases, not complete or objective safety.
No model APIs, real credentials, remote exporters or new privileges are needed.
Cost estimates require a host-supplied versioned rate table; missing usage or
rates remains unknown, and estimates are not provider invoices.
