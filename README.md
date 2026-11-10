# GrantFlow + Public Ledger

GrantFlow is the working front end for the GrantFlow contract, an
AI-jury grant contract on GenLayer. A grantor locks GEN in escrow, a builder
submits milestone evidence as links to real deliverables, the contract itself
fetches the linked artifacts, and an AI validator jury judges the fetched
content against the milestone spec. Approved milestones pay out. The Public
Ledger is the proof view: every grant, verdict, score, reasons and grounding
receipt, readable by anyone.

**Live dApp:** https://grantflow-ameer-hamza-s-projects2.vercel.app/
**Contract:** `0x508fdD2b24F990db944Fa6aEcD590615Cfb9A183`
**Network:** GenLayer Bradbury Phase 2, chain ID 4221
**Explorer:** https://explorer-bradbury.genlayer.com/address/0x508fdD2b24F990db944Fa6aEcD590615Cfb9A183
**Deploy tx:** `0x6ad52421ea0bfcf42931d57cf66cc547d430050a12f96697196d5762a250c2bd`

## How a grant moves

1. **Create** — the grantor creates a grant with a builder address, a title,
   and milestones (each with an amount in GEN and a deadline).
2. **Fund** — the grantor funds the exact escrow. Funding the wrong amount,
   or funding from the wrong address, refunds in full on the spot.
3. **Submit** — the builder submits milestone evidence as links. The
   builder's summary is only the claim; the linked artifacts are the
   evidence.
4. **Assess** — anyone triggers the AI jury. The contract fetches each
   evidence link inside the jury, grounds the verdict on the fetched excerpts
   only, and stores a grounding receipt (`artifacts_fetched`,
   `primary_sha256`). If an artifact cannot be retrieved, there is no verdict
   and no funds move — the milestone returns for resubmission.
5. **Release** — on a MET verdict the grantor releases the tranche: the
   full amount is credited to the builder as a claim. On a PARTIAL verdict
   the release credits the verdict's percentage to the builder and the
   remainder to the grantor at the same time. The builder withdraws a claim
   to receive it on chain.
6. **Appeal** — after a NOT_MET verdict the builder may request exactly one
   re-assessment; the second verdict is final.
7. **Expire** — after a milestone's deadline, anyone may trigger expiry,
   crediting that milestone's unclaimed escrow to the grantor.
8. **Cancel** — the grantor can cancel for a refund of unclaimed escrow,
   except while an awarded tranche is unpaid.
9. **Withdraw** — a recipient withdraws a claim. The transfer lands on
   chain, and the recipient confirms receipt to clear the pending record.
   If a transfer never arrives, the owner can restore the pending
   withdrawal (after 10 minutes) so it is claimable again.

## The contract

The Bradbury contract this dApp runs on lives in this repo:
[`contracts/GrantFlow.py`](contracts/GrantFlow.py)
(SHA-256 `eb6699b72a08e51a58ef6a45fef6c037e7d33b973e107fbcd891af7d96b2571f`).

| | |
|---|---|
| Contract | GrantFlow v3.3, `0x508fdD2b24F990db944Fa6aEcD590615Cfb9A183` |
| Network | Bradbury Phase 2, chain 4221 |
| Deploy tx | `0x6ad52421ea0bfcf42931d57cf66cc547d430050a12f96697196d5762a250c2bd` |
| GenVM | v0.3.0-rc10 |
| Verdict | strict MET / PARTIAL / NOT_MET with payout percentage, score null, grounding receipt |
| GEN | native currency, 1 GEN = 10^18 wei |

Writes: `create_grant(builder, title, milestones_json)`,
`fund_grant(grant_id)` (payable), `submit_evidence(grant_id, evidence_json)`,
`request_appeal(grant_id)`, `assess_milestone(grant_id)`,
`release_tranche(grant_id)`, `expire_milestone(grant_id)`,
`cancel_grant(grant_id)`, `withdraw_claim()`, `confirm_withdrawal()`,
`restore_pending(recipient)`, `sweep_excess()`, `set_paused(bool)`,
`transfer_ownership(new_owner)`.

Views: `get_grant`, `get_milestone`, `get_verdict`, `get_claimable`,
`get_pending`, `get_grants_for_party`, `get_activity_history`,
`get_protocol_overview`.

Design properties, all enforced in the contract:

- **Permission-gated writes** — only the grantor, builder, or the right party
  for each step can move a grant.
- **Evidence bound by SHA-256** — verdicts carry the hash of the fetched
  artifact; a mismatch fails closed with no state change and no funds moved.
- **Fail-closed assessment** — unreachable evidence returns the milestone to
  OPEN instead of settling anything.
- **Exact funding** — `create_grant` is non-payable (PENDING_FUNDING);
  `fund_grant` refunds in full inline on a wrong amount, wrong sender, or
  wrong status. Builder addresses are validated (`0x` + 40 hex, non-zero).
- **One appeal, then final** — the builder gets exactly one re-assessment
  after NOT_MET; the second verdict cannot be appealed.
- **Milestone deadlines with expiry** — a milestone that passes its
  deadline (plus a grace window) can be expired, returning its unclaimed
  escrow to the grantor.

## How payouts work

A release, expiry or cancel only credits a claim — no GEN moves until the
recipient withdraws it. `withdraw_claim` pays inline through the contract's
ghost contract, using the documented Faucet pattern: an empty EVM contract
interface (`_Recipient`) and
`_Recipient(Address(recipient)).emit_transfer(value=amount)`.

The withdrawal attaches the external message allocation:

| Field | Value |
|---|---|
| Recipient | the claimant |
| Call key | 32 zero bytes (a bare transfer has empty calldata) |
| Budget | 0.0012 GEN — exactly 20x gas limit x max gas price |
| Gas limit / max gas price | 200000 / 300000000 |
| Fee value | round fees + 0.0012 GEN |

Without that allocation the payout message is emitted but never executes —
the parent transaction can return success while nothing moves. This app
therefore shows the recipient balance change after a withdrawal, not just
the receipt status, and the claim moves to a pending record first: only
confirming receipt clears it.

## The dApp

Two views, one contract:

- **GrantFlow** — the grant file. Grant at the top, milestones in the middle,
  verdict history underneath, activity feed below. Create, fund,
  submit-evidence, assess, release, appeal, expire, cancel, withdraw.
  Buttons enable only for the right party and state, with the reason shown.
  No wallet is needed to read — every number and verdict comes from the
  contract. Grant files deep-link (`#grant-<id>`), and a light theme sits
  beside the dark one.
- **Public Ledger** — every grant, verdict, score, reasons and grounding
  receipt, filterable by MET / PARTIAL / NOT_MET / evidence-unreachable,
  newest first.

Stack: Vite + React, genlayer-js 2.0.0-rc.2, node RPC
`https://rpc-bradbury.genlayer.com`. Wallet connects in the browser
(MetaMask/Rabby) and switches to Bradbury (chain 4221). No keys are handled
by this app. The payout allocation is wired into `src/lib/genlayer.js`
(`payoutFees(payee)`) on `withdraw_claim`.

## Repository layout

```text
contracts/
  GrantFlow.py                # GrantFlow v3.3 contract source (Bradbury)
src/
  App.jsx                     # GrantFlow + Ledger views, claim flow
  lib/
    config.js                 # contract address, network, RPC
    genlayer.js               # reads, writes, payout fee allocation
    reputation.js             # on-ledger reputation ribbons
    risk.js                   # steward risk scoring (on-chain fields only)
    theme.js                  # light/dark theme (persisted)
    time.js                   # deadline countdowns
  components/
    GrantFile.jsx             # grant file view
    CreateGrant.jsx           # create-grant form
    Ledger.jsx                # public ledger view
    GrantProgress.jsx         # milestone progress bar
    DeadlineChip.jsx          # deadline countdown chip
    GroundingReceipt.jsx      # verdict grounding receipt slip
    VerdictSeal.jsx           # verdict seal
    RiskHeatmap.jsx           # steward risk heatmap
    Skeletons.jsx             # loading skeletons
```

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # production build (output: dist/)
```

## Links

- Live dApp: https://grantflow-ameer-hamza-s-projects2.vercel.app/
- Contract on Bradbury explorer: https://explorer-bradbury.genlayer.com/address/0x508fdD2b24F990db944Fa6aEcD590615Cfb9A183
- GenLayer docs, value transfers: https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
