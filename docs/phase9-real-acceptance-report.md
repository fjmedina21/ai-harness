# Real acceptance — single developer and durable Podman

Date **2026-11-25**. Version **0.8.0**. Implementation commit `0e0d9cd`, base `df501d8`, local feature branch
`feat/single-developer-podman-gate`. No push, merge, tag, release or remote CI claim.

**Gate C: LIVE VERIFIED / accepted only for the local registered gatec-synthetic
project and exact local-podman fixed Node profiles.** This accepts no other project,
image, Machine, resource budget, command profile or arbitrary package/native build.
Unknown/unaccepted scope stays BLOCKED. Phase 9C/9D are not implemented.

## Owner and private migration

The owner explicitly authorized the reviewed single-owner migration and real tests.
The active profile had failed the new reader with invalid_host_policy. A private
candidate preserving OAuth fields and existing narrower file policy/capabilities
was validated offline. Fifteen old profile/journal/artifact/workspace files were
backed up and byte-hash verified with SQLite integrity ok; quiescent profile/journal
users were checked before atomic replacement. No old journal, approver, grant,
expiry, audit row or HMAC key was converted. Keychain values were not copied.
The new real OAuth login verified stable owner **70180651** with App binding and
stored its session through the existing protected Keychain adapter. Another owner
is not authorized. No model/provider call or charge occurred.

## Actual durable actions

First execution: `931c2f64-bdde-4bb8-ae5f-310792c84c33`. Human review used exact
fixture diff, typed APPROVE and actual macOS authentication. Separate native human
decisions then authorized each exact sandbox action. Preparation, approval,
execution and evidence inspection ran as separate Node processes using real
private SQLite v3, artifacts, evidence and the existing Podman runtime.

| Action | Observed outcome | Durable state | Cleanup |
| --- | --- | --- | --- |
| test | passed, exit 0 | Completed | confirmed |
| output | failed with action.output_limit, bounded output | Completed | confirmed |
| timeout | timeout, timedOut true | Completed | confirmed |
| cancel | cancelled after observed Running | Uncertain, retained claim | confirmed |

The cancellation state is deliberately conservative. Its evidence was reopened
without execution; no uncertain effect was retried, grant restored or claim erased.
Manual host reconciliation remains required for that execution.

Current fixed isolation probes also passed on Podman **6.1.4**, linux/arm64,
kernel **7.2.7-200.fc44.aarch64**, container Node **24.22.3**. Effective observations:
UID 65534, no capabilities, seccomp 2, no-new-privileges, read-only root, network
denied, 16 MiB noexec tmpfs, CPU 0.5, memory 268435456 bytes, zero swap, PIDs 64.
The pinned image digest is
`b4955566e9320d2b70ddbd933053c216ae4b1d83f6bf947184e4d7de504059c2`.
Only the existing dedicated rootless Machine and pre-pulled image were used.
No machine start/reconfiguration, package install, image download, host execution
of generated code or broad cleanup occurred. These observations establish this
profile's effective controls, not resistance to kernel/runtime escape or all
adversarial resource exhaustion workloads.

## CLI acceptance

After verifying all four native-approved durable results and effective probes,
a private create-only HMAC acceptance record was published for this project/profile.
It binds the full project authorization, owner, runtime options/code, isolation
observations and exact evidence IDs. Maximum record lifetime is 24 hours; workspace
expiry, source/snapshot change, code/policy change and integrity failure can block
it earlier. This is host policy with corruption protection, not external attestation.
No acceptance field was added to repository/model configuration.

A fresh actual CLI execution **a5aabba6-7f19-49c1-b2b4-eeef92e1fe2c** then generated
another fixture proposal, obtained a new native patch decision, continued the patch,
and obtained another native sandbox decision through:

```sh
pnpm harness engineering validate \
  --id a5aabba6-7f19-49c1-b2b4-eeef92e1fe2c \
  --profile local-podman --action test
```

The actual test ran from **21:18:45.524Z to 21:18:47.642Z**, exit 0, output digest
`a1c159f968f9d27cba93ea85a116745290559a191c6e13063aadd377614562f6`, cleanup confirmed.
Validation ID **8372d7435aae13ddcf9fa91d5989982c26332772e5dc19031405dc19a345222e**
was independently read in another CLI process with no replay. Unaccepted profile
rejected as validation_acceptance_pending. A direct consumed-grant replay was
also denied before runtime invocation. Nine distinct actual native intent IDs
were verified across three patch and six sandbox decisions. All requester/
approver IDs matched the owner; exact challenges/scopes and consumed state matched.
Selected original source inventory remained unchanged throughout.

### Final exact-code CLI recheck

After tightening acceptance revocation checks and rejecting explicit scope widening,
the previous signed acceptance metadata was archived and the same immutable real
native/probe evidence was independently reverified for the final code digest.
No grant or operation was restored or replayed.

Fresh execution `80412ee2-fdd8-434c-b93d-61a7da2ba689` then passed the entire CLI path with
another exact native patch and sandbox decision. The real test ran from
`2026-11-25T21:38:11.586Z` to `2026-11-25T21:38:13.990Z`, exit 0 and confirmed cleanup.
Validation ID `40c1acdf0e94301d0422d616300f638837e858616f68c8d8f5b6795e7f5ed424` reopened without execution. This is the
final code's live CLI result. Original source remained unchanged, and an independent
journal audit confirmed all nine native decisions and consumed-grant replay denial.


## Classification and limits

IMPLEMENTED: single owner, no multiuser administration/operational Team, independent
project policies/capabilities, complete project fingerprint, Personal-only approval,
durable sandbox session transfer and evidence inspection, signed acceptance CLI.

OFFLINE VERIFIED: **873/873** full, **150/150** GitHub, **43/43** Personal,
**76/76** Phase 9B; schema rollback/recovery, adversarial identity/path/project/policy/
profile cases, forged confirmation, expiry, replay, concurrency, fencing and SIGKILL.
Adversarial cases using simulated identities/transports are not described as live.

LIVE VERIFIED: real owner OAuth/Keychain session; native patch/sandbox decisions;
four exact durable real Podman outcomes, current effective probes, cross-process
evidence; new full CLI test; rejection of unaccepted profile and consumed replay;
original source unchanged. Private evidence is in the excluded development folder.

BLOCKED: every other project/profile without its own accepted scope; expired/
changed acceptance; arbitrary shell/native/dependency builds; automatic uncertain
recovery; remote dedicated-runner acceptance; production autonomy and Phase 9C/9D.
Same-UID hostile races, compromised host/verifier/runtime, cross-store transactionality
and exactly-once execution are not guaranteed. Historical evidence is preserved in
[the earlier report](history/phase9-acceptance-before-single-developer.md).

## Implementation map

| Files | Change |
| --- | --- |
| security/github-auth, CLI/github-host | Single owner, independent project capabilities/limits, strict private schema |
| contracts/approval-policy, security approval services, checkpointing/sqlite-journal | Personal-only decisions; historical read-only decoder; owner binding; existing CAS/fencing |
| application/engineering-resume, checkpointing/proposal-artifact-store | Complete project authorization fingerprint in authenticated proposals |
| tools/validation-coordinator | Registered exact project/action, durable sandbox lease transfer and verified read-only evidence recovery |
| checkpointing/podman-acceptance-store, application/podman-validation, CLI/engineering-cli | Create-only domain-HMAC acceptance and conditional current-scope CLI execution/inspection |
| package tests and scripts | Preserved shared regressions, new project/acceptance/multiprocess coverage |
| docs and README | Current architecture/migration/security; historical acceptance preserved separately |
