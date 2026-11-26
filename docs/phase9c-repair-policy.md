# Finite repair policy

Repair policy is host-selected, versioned and immutable during a session. Its digest
is stored with owner, project, action/profile and original source provenance.
Budgets are cumulative across process restarts and human-review delays.

Admission checks iterations, provider requests, input/output or total token
allowances, elapsed global time, per-provider/per-validation deadlines, file count,
patch bytes, validation count and estimated monetary cost when available. Unknown
cost remains unknown and requires an explicit host policy; it is never zero.
Pending effects retain their reservations. Negative, nonfinite, overflowing or
out-of-range counters fail closed. A model cannot increase any limit.

Each new patch stops for a fresh exact Personal L2 review. Each executable
validation stops for a separate sandbox approval. The finite coordinator may
analyze a verified code failure and prepare another proposal; it cannot consent
on the developer's behalf or replay uncertain work.

Repeated patch/content/snapshot/diagnostic fingerprints and equivalent-state
cycles terminate deterministically as NoProgress according to policy. Budget
exhaustion terminates before starting another request. Failed infrastructure,
authorization or uncertain evidence is not sent to the repair agent as a code error.
See [states](phase9c-state-machine.md) and [security](phase9c-security.md).


Before accepting a sandbox action, the CLI requires enough global time remaining
for its complete fixed action timeout. Patch continuation, native review and
sandbox execution also receive a cancellation signal capped by the persisted
global deadline. Rechecks after human review and at the runtime/fenced-write
boundary prevent a prolonged review from extending the session budget.


The original engineering proposal has its own budget. A repair session explicitly
starts a separate finite repair policy; it does not reset counters between repair
iterations or process restarts. Its immutable policy and cumulative totals remain
visible alongside the original proposal accounting.

Unknown consumed or reserved monetary cost is stored as `null`. Explicit
`allowUnknownCost` permits finite token/time-limited work with unknown cost; it
cannot establish a hard monetary total. After cost becomes unknown, a future
positive monetary reservation is blocked because remaining money cannot be proved.
Zero-priced synthetic calls remain distinct from an unknown paid estimate.
