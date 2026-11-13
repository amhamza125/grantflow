# GrantFlow + Public Ledger

GrantFlow is an AI-jury grant contract on GenLayer, and this is its working
front end. A grantor locks GEN in escrow, a builder submits milestone
evidence as links to real deliverables, the contract itself fetches the
linked artifacts, and an AI validator jury judges the fetched content
against the milestone spec. Approved milestones pay out. The Public Ledger
is the proof view: every grant and every verdict — verdict, payout
percentage, reasons and grounding receipt — readable by anyone, with no
wallet connected.

**Live dApp:** https://grantflow-ameer-hamza-s-projects2.vercel.app/
**Contract:** `0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE`
**Contract on the explorer:** https://scan.bradbury.genlayer.com/address/0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE
**Deploy tx:** `0x4bbdd252bc5efcd59877d01abe541db61f5cc3a67f124dcd96fd27f9ccf3fb49`
**Network:** GenLayer Bradbury Phase 2, chain ID 4221

## How a grant moves

1. **Create** — the grantor creates a grant with a builder address, a
   title, and milestones (each with an amount in GEN and a deadline).
2. **Fund** — the grantor funds the exact escrow. Funding the wrong
   amount, funding from the wrong address, or funding a grant in the
   wrong status does not pay anything back on the spot: the sent GEN is
   credited as a claim the sender withdraws with `withdraw_claim`.
3. **Submit** — the builder submits milestone evidence as links. The
   builder's summary is only the claim; the linked artifacts are the
   evidence. A submission holds at most 10 links; more than 10 is
   rejected (`TOO_MANY_LINKS_MAX_10`), never silently cut.
4. **Assess** — the grantor or the builder triggers the AI jury
   (`ONLY_PARTY_ASSESS`). The contract fetches each evidence link inside
   the jury, grounds the verdict on the fetched excerpts only, and stores
   a grounding receipt (`artifacts_fetched`, `evidence_sha256`). If an
   artifact cannot be retrieved, there is no verdict and no funds move —
   the milestone returns for resubmission.
5. **Release** — on a MET verdict the grantor or the builder releases the
   tranche: the full amount is credited to the builder as a claim. On a
   PARTIAL verdict the release credits the verdict's percentage to the
   builder and the remainder to the grantor at the same time. The builder
   withdraws a claim to receive it on chain.
6. **Appeal** — after a NOT_MET verdict the builder may request exactly
   one re-assessment; the second verdict is final.
7. **Expire** — after a milestone's deadline, anyone may trigger expiry,
   crediting that milestone's unclaimed escrow to the grantor as a claim.
   A milestone that was submitted on time can only expire after the
   deadline plus an 1800-second grace window.
8. **Cancel** — the grantor can cancel for a refund of unclaimed escrow,
   except while an awarded tranche is unpaid. The refund is worked out
   per milestone — each remaining milestone contributes amount minus paid
   minus already-refunded — and is credited to the grantor as a claim,
   which the grantor withdraws.
9. **Withdraw** — a recipient withdraws a claim. The transfer lands on
   chain, and the recipient confirms receipt to clear the pending record.
   If a transfer never arrives, the owner can restore the pending
   withdrawal (after 10 minutes) so it is claimable again.

## The contract

The Bradbury contract this dApp runs on lives in this repo:
[`contracts/GrantFlow.py`](contracts/GrantFlow.py)
(SHA-256 `1e48e1a8c476b4c11ddb3ae705811d6c35087c078af7d4947e1e2fe50406d2df`).

| | |
|---|---|
| Contract | GrantFlow v3.4, `0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE` |
| Network | Bradbury Phase 2, chain 4221 |
| Deploy tx | `0x4bbdd252bc5efcd59877d01abe541db61f5cc3a67f124dcd96fd27f9ccf3fb49` |
| GenVM | v0.3.0-rc10 |
| Verdict | strict MET / PARTIAL / NOT_MET with payout percentage, reasons and a grounding receipt |
| GEN | native currency, 1 GEN = 10^18 wei |

Writes: `create_grant(builder, title, milestones_json)`,
`fund_grant(grant_id)` (payable), `submit_evidence(grant_id, evidence_json)`,
`request_appeal(grant_id)`, `assess_milestone(grant_id)`,
`release_tranche(grant_id)`, `expire_milestone(grant_id)`,
`cancel_grant(grant_id)`, `withdraw_claim()`, `confirm_withdrawal()`,
`restore_pending(recipient)`, `sweep_excess()`, `set_paused(bool)`,
`transfer_ownership(new_owner)`, `accept_ownership()`.

Views: `get_grant(grant_id)`, `get_milestone(grant_id, milestone_id)`,
`get_verdict(grant_id)`, `get_claimable(address)`, `get_pending(address)`,
`get_grants_for_party(party)`, `get_activity_history(limit)`,
`get_protocol_overview()`.

Design properties, all enforced in the contract:

- **Permission-gated writes** — only the grantor, builder, or the right
  party for each step can move a grant.
- **Evidence bound by SHA-256** — every verdict carries `evidence_sha256`,
  the SHA-256 of all fetched cleaned evidence bodies joined in link order,
  so the receipt covers every artifact the jury grounded on, not just the
  first. The receipt proves which artifacts were hashed; it does not by
  itself make the jury's reasoning fully auditable.
- **Fail-closed assessment** — unreachable evidence returns the milestone
  to OPEN instead of settling anything.
- **Exact funding** — `create_grant` is non-payable (PENDING_FUNDING);
  a rejected `fund_grant` (wrong amount, wrong sender, or wrong status)
  credits the sent GEN as a claim the sender withdraws — nothing is paid
  inline on a rejection. Builder addresses are validated
  (`0x` + 40 hex, non-zero).
- **One appeal, then final** — the builder gets exactly one
  re-assessment after NOT_MET; the second verdict cannot be appealed.
- **Milestone deadlines with expiry** — a milestone that passes its
  deadline (plus the grace window) can be expired, returning its
  unclaimed escrow to the grantor as a claim.
- **Evidence links, capped at 10** — submissions hold at most 10 links;
  coherent sets of 1–5 artifact links assess most reliably.
- **Owner pause, exits stay open** — pausing blocks create_grant,
  fund_grant, submit_evidence, request_appeal, assess_milestone and
  release_tranche, while cancel, expire, withdraw, confirm and restore
  stay open so funds remain recoverable.

## Verified on-chain (v3.4)

- **Deploy** — tx
  `0x4bbdd252bc5efcd59877d01abe541db61f5cc3a67f124dcd96fd27f9ccf3fb49`,
  contract `0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE`, source SHA-256
  `1e48e1a8c476b4c11ddb3ae705811d6c35087c078af7d4947e1e2fe50406d2df`.
- **Multi-link jury assessment** — one submission with 3 evidence
  artifacts assessed MET at 100%, with `evidence_sha256`
  `5e45fbe51f2674d1cd504cd1962161f1e3bd63ec84d8b1db3b57093fc23abbc2`.
- **Targeted cancel** — grant 11 was cancelled for a 0.006 GEN refund;
  the per-milestone breakdown sums exactly to the refund credited.
- **Full lifecycle** — create → fund → submit → assess → release →
  withdraw exercised end to end on this deployment, plus the appeal,
  cancel and expiry paths.
- **Current state** — contract balance == locked == 0.001 GEN (one
  in-flight grant); claimable 0; pending 0.

## How payouts work

A release, cancel or expiry only credits a claim — no GEN moves until the
recipient withdraws it. `withdraw_claim` executes the transfer through
GenLayer's external message allocation (wired in `src/lib/genlayer.js`);
the claim sits in a pending record until the recipient confirms receipt,
and the app verifies the payout by the recipient's balance change, not
just the transaction receipt.

## The dApp

Two views, one contract:

- **GrantFlow** — the grant file view. The grant feed leads with Featured
  grants and filters by Assessed, Active, Completed or My grants, with
  search on top. Opening a grant shows the grant at the top, milestones in
  the middle, the jury verdict card and activity underneath. Create, fund,
  submit-evidence, assess, release, appeal, expire, cancel, withdraw —
  buttons enable only for the right party and state, with the reason
  shown. The Jury Verdict card shows the verdict, the payout percentage,
  the jury's reasons, the validator count from the assessment
  transaction, and a Verify SHA-256 action that shows the grounding
  formula and the evidence links so anyone can re-derive the hash; the
  grounding receipt (artifacts fetched, `evidence_sha256`) opens as a
  slip under the card. Grant files deep-link (`#grant-<id>`), and a light
  theme sits beside the dark one.
- **Public Ledger** — every event the contract has recorded, newest
  first, filterable by Funds, Evidence, Jury or Payout, each entry
  linking to its transaction on the explorer where a hash is known.
  Protocol events (pause, sweep, ownership) sit behind their own toggle.
- **My Funds** — the connected wallet's claimable and pending amounts,
  with withdraw and confirm actions; the contract owner also gets the
  pause, restore and sweep controls there.
- **Contract switcher** — the app can be pointed at another GrantFlow
  deployment for the session (it probes the address before switching);
  the official contract is one tap away.

No wallet is needed to read — every number and verdict comes from the
contract. Stack: Vite + React, genlayer-js 2.0.0-rc.2, node RPC
`https://rpc-bradbury.genlayer.com`. Wallets: tested end-to-end with OKX;
any injected EIP-6963 wallet (MetaMask, Rabby, …) works, and
WalletConnect is optional with a Reown project ID. No keys are handled by
this app.

## Repository layout

```text
README.md                     # this file
index.html                    # app entry page; loads src/main.jsx
package.json                  # dependencies and npm scripts
package-lock.json             # dependency lockfile
vite.config.js                # Vite + React; explorer-API proxy for dev/preview
vercel.json                   # rewrites /api/explorer/* to the Bradbury explorer API
postcss.config.js             # PostCSS: Tailwind + autoprefixer
tailwind.config.js            # Tailwind theme (semantic light/dark colors)
.env.example                  # optional env vars: VITE_WC_PROJECT_ID, VITE_CONTRACT_ADDRESS
public/
  favicon.svg                 # favicon
contracts/
  GrantFlow.py                # GrantFlow v3.4 contract source (Bradbury), as deployed
src/
  main.jsx                    # React entry; mounts the app
  App.jsx                     # app shell: header, view tabs, GrantFlow / Ledger views
  index.css                   # Tailwind layers + theme CSS variables
  lib/
    config.js                 # contract address, chain, RPC and explorer URLs
    genlayer.js               # GenLayer client: reads, writes, payout fee allocation
    contract.js               # session-only contract switching (probe-first)
    store.jsx                 # the single app store: wallet, grants, activity, actions
    grants.js                 # grant loading helpers + feed filters and counts
    activity.js               # activity entries → timeline data and categories
    txlinks.js                # resolves activity entries to explorer tx links
    wallet.js                 # wallet discovery (EIP-6963) + WalletConnect
    walletSession.js          # wallet session persisted across reloads
    reputation.js             # on-ledger reputation ribbons from loaded grants
    theme.js                  # light/dark theme, persisted
    time.js                   # milestone deadline countdowns
  components/
    Header.jsx                # header with wallet connect state
    JourneyRibbon.jsx         # three-step ribbon: connect → grant → payout
    StatsBar.jsx              # protocol stats from the contract overview
    ContractCard.jsx          # contract address card + switcher
    GrantList.jsx             # grant feed with search and filters
    GrantCard.jsx             # one grant in the feed
    GrantDetail.jsx           # the grant file: milestones, verdicts, actions, activity
    GrantProgress.jsx         # stepper: Funded → Evidence → Jury → Payout
    DeadlineChip.jsx          # milestone deadline countdown chip
    CreateGrant.jsx           # create-grant wizard
    JuryVerdictCard.jsx       # per-milestone verdict card with Verify SHA-256
    GroundingReceipt.jsx      # expandable grounding receipt slip
    VerdictBadge.jsx          # shared verdict badge
    AssessProgressBar.jsx     # live progress while an assessment is in flight
    ActivityTimeline.jsx      # shared activity timeline (grant file + Ledger)
    Ledger.jsx                # Public Ledger view
    MyFunds.jsx               # wallet drawer: claimable, pending, owner controls
    WalletChooser.jsx         # wallet chooser sheet (injected + WalletConnect)
    Toasts.jsx                # toast notifications with explorer links
```

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # production build (output: dist/)
```

Copy `.env.example` to `.env` for local development: `VITE_WC_PROJECT_ID`
is optional (enables WalletConnect), and `VITE_CONTRACT_ADDRESS` is an
optional override for the contract address.

## Links

- Live dApp: https://grantflow-ameer-hamza-s-projects2.vercel.app/
- Contract on the Bradbury explorer: https://scan.bradbury.genlayer.com/address/0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE
- GenLayer docs, value transfers: https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
