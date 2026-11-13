# GrantFlow — Test Report

Verification record for the GrantFlow deployment on GenLayer Bradbury.
Every result below is an on-chain read or a transaction record from the
deployment under test.

## System under test

| Item | Value |
|---|---|
| Contract | `0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE` |
| Network | GenLayer Bradbury Phase 2, chain ID 4221 |
| GenVM | v0.3.0-rc10 |
| Source SHA-256 | `1e48e1a8c476b4c11ddb3ae705811d6c35087c078af7d4947e1e2fe50406d2df` |
| Deploy transaction | `0x4bbdd252bc5efcd59877d01abe541db61f5cc3a67f124dcd96fd27f9ccf3fb49` |
| Recorded lifecycle steps | 260 |

## End-to-end lifecycle

| Test case | Expected behavior | On-chain result | Transaction |
|---|---|---|---|
| Full grant settlement (grant #16) | Both milestones assessed MET and released; the grant completes | Both milestones MET at 100%; 0.02 GEN released; grant status COMPLETE | Assess: `0x267f9fd81fbd0ef2ca6189cb072d05080d6c208185161d0aba5899a258c250f5` |
| Multi-artifact grounding (grant #6) | The jury grounds its verdict on every submitted artifact | 3 evidence links submitted; 3 fetched, 0 unavailable; verdict MET at 100%; `evidence_sha256` `5e45fbe51f2674d1cd504cd1962161f1e3bd63ec84d8b1db3b57093fc23abbc2`, equal to the hash computed over the 3 fetched artifacts | — |
| PARTIAL verdict split settlement (grants #17, #18) | A release credits the verdict percentage to the builder and the remainder to the grantor in the same call | 50% case on 0.010000000000000001 GEN: builder credited 0.005 GEN, grantor credited 0.005000000000000001 GEN, contract deltas exact to the wei. 25% case: 0.0025 GEN released, 0.007500000000000001 GEN refunded. Both grants COMPLETE | — |
| NOT_MET verdict and single appeal (grants #19, #20) | One appeal per milestone; the second verdict is final | Grant #19: NOT_MET → appeal → MET, marked final. Grant #20: NOT_MET → appeal → NOT_MET, status REJECTED_FINAL, marked final. A second appeal is rejected (see Rejection cases) | — |
| Milestone expiry (grant #21) | An unassessed milestone expires after its deadline and its escrow returns to the grantor | Milestone EXPIRED; 0.005 GEN refunded to the grantor; contract delta −0.005 GEN, exact | — |
| Expiry of a submitted milestone (grant #8) | A milestone submitted on time and never assessed expires only after the deadline plus the 1800-second grace period | Milestone EXPIRED after the grace period; 0.005 GEN refunded to the grantor; contract delta −0.005 GEN, exact | — |
| Multi-milestone cancel accounting (grant #11) | Cancel refunds each remaining milestone's unspent amount, and the per-milestone breakdown sums to the refund | Refund 0.006 GEN; allocation sum == breakdown sum == refund (6,000,000,000,000,000 wei each); the refund was withdrawn. Companion cases — cancel after a MET verdict, after a PARTIAL verdict, and after an expiry — also pass, with no double counting | — |
| Misdirected funding returns as a claim (grant #22) | Funding that is not the exact escrow sent by the grantor does not enter escrow | Wrong amount, a non-party sender, and a second funding each left the contract balance unchanged and credited the sent GEN to the sender as a refundable claim | — |
| Two-phase pull payout (grant #28) | A release credits a claim; the GEN moves on withdraw, and the claim clears on confirm | Contract delta exactly −0.001 GEN; recipient balance delta +696,589,079,996,118 wei (the released 0.001 GEN net of the payout fee); claimable 0 and no pending record after confirm | Withdraw: `0x39bd2642cbf0239549bad0b39d9b3a602b19c2d3ece640d8d366eeea5c498bf4` · Confirm: `0xa05c74204239255adaae96ddec0457e1541f9a13d66a40c12e71b56e4b74a81f` |
| Withdrawal without the payout allocation | The call returns success but no transfer executes; the entitlement stays recoverable | Contract and recipient balances unchanged; the entitlement was recorded as pending 0.001 GEN with claimable 0; it was later restored and withdrawn in full | — |

## Rejection cases

Each case was submitted as a live transaction against the deployment.
The contract rejected it with the stated error, and the targeted state
was unchanged.

| Category | Cases | Enforced error / invariant | Example transaction | Result |
|---|---:|---|---|---|
| Permission gates | 4 | `ONLY_BUILDER` (outsider submit, outsider appeal), `ONLY_PARTY_ASSESS` (outsider assess), `ONLY_OWNER` (outsider restore) | `0xc3581e64fb34e0834b141405d78899ac88aac38f7ece04314e6dc875e854e9b2` (outsider assess) | Rejected; state unchanged |
| Creation input validation | 18 | `INVALID_BUILDER` (short, zero, non-hex address); `INVALID_TITLE` (empty); `INVALID_MILESTONES` (malformed list, zero amount, amount below the 10^15 wei minimum, 2^256 overflow, non-monotonic / equal / too-close deadlines, missing, zero, past or too-soon deadline, empty spec) | `0xa73f834a8f88d82a933b1ae160112e474ea612c57ede4eaa600aedffac45e0f9` (short builder address) | Rejected; no grant created |
| Funding guard | 1 | Zero-value funding rejected with `ESCROW_REQUIRED`. The related wrong-amount, non-party and repeat-funding behaviors are recorded in the lifecycle table above | `0xf26ca473e5847160bd2e1fd7d3f61b3c0eac35e87766a2df2984b5c5aef722eb` (zero-value funding) | Rejected; escrow accounting unchanged |
| Pause scope | 7 | `PROTOCOL_PAUSED` on create, fund, submit, appeal, assess and release while paused; cancel, expire, withdraw, confirm and restore are not pause-gated | `0xe74c8d936abd884a64cd88476f30b395a0765276f304467ac1daf689bee47461` (create while paused) | Rejected; state unchanged |
| Appeal rules | 6 | `APPEAL_NOT_AVAILABLE` (appeal of a MET verdict; second appeal), `APPEAL_REQUIRED` (resubmission without an appeal), `APPEAL_PENDING` (cancel while an appeal is open), `BAD_STATUS` (second appeal after the grant closed) | `0xcabe0578bf4c973bd1d50e2b2ddc0c05871b90adf274e096cfdaee75f0cc55f5` (appeal of a MET verdict) | Rejected; state unchanged |
| Evidence limits | 6 | `TOO_MANY_LINKS_MAX_10` (11 links: the submission is rejected whole, never truncated); `INVALID_EVIDENCE` (malformed JSON, empty summary, link over 512 chars, non-http(s) link); unreachable evidence fails closed — the milestone reopens with no verdict and no funds moved | `0xc406702adc7dbe5a9a5bf06a0f4f85eea557e0e7ff6a85e29a1403a209afb365` (11 links) | Rejected; state unchanged |
| Ownership transfer guards | 7 | `INVALID_OWNER` (zero, short, non-hex address); `NO_PENDING_OWNER` / `NOT_PENDING_OWNER` (accept with no pending transfer, accept by a non-nominated account, accept after the nomination was overwritten) | `0x59c117a158f3e973eaa9705b1db9c0967f1245ef576c861abdbe86c88106296e` (accept with no pending transfer) | Rejected; ownership unchanged |
| Payout-state guards | 6 | `PENDING_WITHDRAWAL` (second withdraw while one is pending), `TOO_EARLY` (restore before the 600-second gate), `NO_EXCESS` (sweep cannot take pending funds), `NO_CLAIM` (outsider withdraw; repeat withdraw), `BAD_STATUS` (repeat release) | `0xc52489e98a8c8e3b85898e4945fa0bde7c4cde4f0137a4fe216b059c2780b838` (repeat withdraw) | Rejected; balances unchanged |
| Lifecycle state guards | 20 | `BAD_STATUS` (actions on cancelled or completed grants; resubmission while a milestone is with the jury), `PENDING_PAYOUT` (cancel after a MET verdict; cancel while a milestone is submitted), `NOT_EXPIRED` (expire a MET or PARTIAL milestone; expire before the deadline or inside the grace period), `NO_VERDICT` (release or assess out of order), `DEADLINE_PASSED` (submit after the deadline) | `0x8ef450812ca3c7bb72601e3fdfd1f78ca1069d616305d187ccb67f427a13282a` (second cancel, grant #11) | Rejected; state unchanged |

**Total: 75 cases — 75 rejected as specified.**

## Fund conservation

Invariant: contract balance == locked escrow + total claimable + total
pending. The invariant holds at the final read.

| Measure | Final value |
|---|---|
| Contract balance | 0.001 GEN (1,000,000,000,000,000 wei) |
| Locked escrow | 0.001 GEN (1,000,000,000,000,000 wei) |
| Total claimable | 0 |
| Total pending | 0 |
| Aggregate released over the run | 0.066 GEN |
| Aggregate refunded over the run | 0.083000000000000002 GEN |
| Released + refunded + claimable | 0.149000000000000002 GEN == total escrowed |

The remaining 0.001 GEN is the locked escrow of the one non-terminal
grant (a submitted 10-link milestone). Its only exit is expiry after
its deadline plus the 1800-second grace period.

## Client verification

The live dApp was pointed at a separate test deployment of the
identical contract source (source SHA-256 identical to the production
deployment): `0x5Ee9ca293d6Bc4242934aFCEE62A6709fE90b184`. The
production deployment was read-only throughout. The dApp was driven as
a brand-new wallet, with builder and outsider wallets, at a 390 px
phone viewport, in dark and light themes. All amounts were verified
against chain state.

| Check | Result |
|---|---|
| Full flow through the UI | Create → fund → submit → assess → release → withdraw → confirm completed. The jury verdict card matched the chain field by field: verdict, payout %, assessment attempts, artifacts fetched, `evidence_sha256`. The validator count (5) was confirmed in the assessment transaction itself |
| MET payout through the UI | The builder's claimable balance increased by exactly the paid amount (0.01 GEN, to the wei); the payout landed in the builder's wallet and was confirmed in the UI |
| Appeal through the UI | NOT_MET → appeal → resubmission → final NOT_MET (REJECTED_FINAL). A further appeal changed nothing |
| Cancel and expiry through the UI | Cancel refunded the escrow exactly and the refund was withdrawn and confirmed. An outsider expired a funded grant through the UI; the refund was exact to the wei |
| Funding rules surfaced in the UI | Wrong-sender and wrong-amount funding were credited back to the wei and shown in the UI as claimable |
| Public Ledger links | 36 transaction links rendered; all 36 resolve to real transactions on the explorer API |
| Final state of the test deployment | Balance == locked == 0.016 GEN; claimable 0; pending 0 |
