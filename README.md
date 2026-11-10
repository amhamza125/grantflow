# GrantFlow + Public Ledger

GrantFlow is the working front end for the Grant Milestone Verifier (GMV), an
AI-jury grant contract on GenLayer. A grantor locks GEN in escrow, a builder
submits milestone evidence as links to real deliverables, the contract itself
fetches the linked artifacts, and an AI validator jury judges the fetched
content against the milestone spec. Approved milestones pay out. The Public
Ledger is the proof view: every grant, verdict, score, reasons and grounding
receipt, readable by anyone.

**Live dApp:** https://grantflow-ameer-hamza-s-projects2.vercel.app/
**Contract:** `0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8`
**Network:** GenLayer Bradbury Phase 2, chain ID 4221
**Explorer:** https://explorer-bradbury.genlayer.com/address/0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8

## How a grant moves

1. **Create** — the grantor creates a grant with a builder address, a title,
   and milestones (each with an amount in GEN).
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
5. **Release** — on a MET verdict the grantor releases the tranche to the
   builder. **Cancel** — the grantor can cancel anytime for a refund of
   unclaimed escrow.

## The contract

The contract is a separate project from this dApp. Its home is the
Grant Milestone Verifier repository:
https://github.com/amhamza125/grant-milestone-verifier — the Bradbury v2.2
source lives there under `bradbury/` (SHA-256
`00768c91b4ce5a3cebc98527694c00b1f9b35d9c9aeb89b5e0df6041bfc4a96d`).

| | |
|---|---|
| Contract | GMV v2.2, `0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8` |
| Network | Bradbury Phase 2, chain 4221 |
| Deploy tx | `0x2431284467e3eee495010ac58a394b71aa854a738a96392eff6e3e96393562a9` |
| GenVM | v0.3.0-rc10 |
| Verdict | strict MET / NOT_MET, score null, grounding receipt |
| GEN | native currency, 1 GEN = 10^18 wei |

Writes: `create_grant(builder, title, milestones_json)`,
`fund_grant(grant_id)` (payable), `submit_evidence(grant_id, evidence_json)`,
`assess_milestone(grant_id)`, `release_tranche(grant_id)`,
`cancel_grant(grant_id)`, `set_paused(bool)`, `transfer_ownership(new_owner)`.

Views: `get_grant`, `get_milestone`, `get_verdict`, `get_grants_for_party`,
`get_activity_history`, `get_protocol_overview`.

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

## How payouts work

A payout is an external message sent through the contract's ghost contract,
using the documented Faucet pattern: an empty EVM contract interface
(`_Recipient`) and `_Recipient(Address(recipient)).emit_transfer(value=amount)`.

Every payout-class transaction (release, cancel refund, refundable fund)
attaches the proven external message allocation:

| Field | Value |
|---|---|
| Recipient | the payee (builder on release, grantor on refund) |
| Call key | 32 zero bytes (a bare transfer has empty calldata) |
| Budget | 0.0012 GEN — exactly 20x gas limit x max gas price |
| Gas limit / max gas price | 200000 / 300000000 |
| Fee value | 0.1012 GEN (round fees + budget) |

Without that allocation the payout message is emitted but never executes —
the parent transaction can return success while nothing moves. This app
therefore shows the recipient balance delta after every payout, not just
the receipt status.

## Verification (Bradbury, live)

Full lifecycle run, block 266153. Every step FINALIZED with
FINISHED_WITH_RETURN; 7 of 7 negative tests passed (malformed inputs rejected
at zero-wei deltas, outsider submit and assess rejected).

| Step | Result |
|---|---|
| Grant 0: create, fund exact 0.02 GEN, submit evidence, assess | Real strict_eq verdict: met = true, score null, grounding SHA `48d2727a…` byte-identical to the fetched artifact |
| Release tranche (tx `0x4572396d…`) | Builder +0.01 GEN exactly, contract −0.01 GEN exactly |
| Malformed fund (wrong 0.005 GEN) | Refunded in full; contract delta 0 |
| Outsider fund (0.01 GEN) | Refunded in full; contract delta 0 |
| Cancel after exact fund | Grantor +0.01 GEN minus fees; contract delta exactly −0.01 GEN |
| Final state | grant_count 3, total_assessed 1, contract holds exactly the 0.01 GEN escrow of grant 0 milestone 1 — nothing stranded |

Scope, stated plainly: this is the targeted lifecycle proof, not the full
28-step suite (s12/s13/G1–G4 unclaimed on this deployment). Grant 0
milestone 1 is still open — its second tranche is the next proof to run.

The same contract line was accepted on GenLayer StudioNet
(`0x5EFB40d03933c83db1b0649141D0ef7743b69641`, 150 Builder points, contribution
Oct 18 2026, submitted Oct 24 2026). The Bradbury v2.2 deployment in this
repo is the same grant logic ported to GenVM v0.3.0-rc10 with the payout
pattern above.

## The dApp

Two views, one contract:

- **GrantFlow** — the grant file. Grant at the top, milestones in the middle,
  verdict history underneath, activity feed below. Create, fund,
  submit-evidence, assess, release, cancel — every button wired to the real
  contract, every number read live from chain. Buttons enable only for the
  right party and state, with the reason shown.
- **Public Ledger** — every grant, verdict, score, reasons and grounding
  receipt, filterable by MET / NOT_MET / evidence-unreachable.

Stack: Vite + React, genlayer-js 2.0.0-rc.2, node RPC
`https://rpc-bradbury.genlayer.com`. Wallet connects in the browser
(MetaMask/Rabby) and switches to Bradbury (chain 4221). No keys are handled
by this app. The Twin14 payout allocation is wired into `src/lib/genlayer.js`
(`payoutFees(payee)`) on release, cancel and fund.

## Repository layout

```text
src/
  App.jsx                     # GrantFlow + Ledger views
  lib/
    config.js                 # contract address, network, RPC
    genlayer.js               # reads, writes, payout fee allocation
  components/
    GrantFile.jsx             # grant file view
    CreateGrant.jsx           # create-grant form
    Ledger.jsx                # public ledger view
verify-live.mjs               # live verification against v2.2 (reads + writes)
verify-reads.mjs              # live read verification
```

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # production build (output: dist/)
```

## Links

- Live dApp: https://grantflow-ameer-hamza-s-projects2.vercel.app/
- Contract on Bradbury explorer: https://explorer-bradbury.genlayer.com/address/0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8
- Accepted StudioNet contract: https://explorer-studio.genlayer.com/address/0x5EFB40d03933c83db1b0649141D0ef7743b69641
- GenLayer docs, value transfers: https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
