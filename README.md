# GrantFlow + Public Ledger

GrantFlow is the working front end for the Grant Milestone Verifier (GMV), an
AI-jury grant contract on GenLayer. The Public Ledger is its public proof
view: every grant, verdict, score, reasons and grounding receipt.

## Contract

- **GMV v2.2:** `0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8`
- **Network:** GenLayer Bradbury Phase 2, chain ID 4221
- **Explorer:** https://explorer-bradbury.genlayer.com/address/0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8

## How it works

A grantor creates a grant and funds it in GEN. A builder submits milestone
evidence as links to real deliverables. The contract itself retrieves the
linked artifacts and an AI validator jury judges the fetched content against
the milestone spec. Approved milestones pay out; the grantor can cancel
anytime for a refund of unclaimed escrow.

Verified on Bradbury: the release paid the builder exactly 0.01 GEN, and
malformed-fund, outsider-fund and cancel refunds all landed in full.

## Payout note

Every payout-class transaction (release, cancel, refundable fund) attaches
the proven external message allocation: recipient = payee, zero call key,
budget 0.0012 GEN (an exact multiple of gas limit x max gas price). Without
it the payout message is emitted but never executes. A successful receipt
alone does not prove a payout — the app shows the recipient balance delta.

## Run it

```bash
npm install
npm run dev
```

Connect a wallet in the browser (MetaMask/Rabby) and switch to Bradbury
(chain 4221). No keys are handled by this app.
