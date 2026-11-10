// Grant progress bar — one segment per milestone, coloured by status; the
// text line totals the verified / settled / credited amounts from the
// milestones on chain.
//
// Wording note: `paid_wei` is money CREDITED as claimable, not money
// received — the builder only receives it after `withdraw_claim` lands on
// chain, and the grantor share of a PARTIAL verdict is credited to the
// grantor at the same time. This component therefore says "credited to
// builder" / "credited to grantor" and never "paid". There is no
// PARTIAL_PAID milestone status: a PARTIAL verdict is recorded on the
// milestone and both shares are credited atomically by release_tranche,
// which advances the milestone to VERIFIED.
import React from "react";
import { weiToGen } from "../lib/genlayer.js";

function segmentTone(m) {
  if (m.status === "VERIFIED" || (m.paid_wei && BigInt(m.paid_wei) > 0n)) return "bg-mint";
  if (m.status === "PARTIAL") return "bg-gold";
  if (m.status === "EXPIRED" || m.status === "REJECTED_FINAL" || m.status === "CANCELLED") return "bg-rose";
  if (m.status === "SUBMITTED") return "bg-cyan";
  return "bg-steel/40";
}

export default function GrantProgress({ milestones, amountWei }) {
  const ms = milestones || [];
  if (ms.length === 0) return null;
  const total = BigInt(amountWei || 0);
  const verified = ms.filter((m) => m.status === "VERIFIED").length;
  const settled = ms.filter((m) => ["VERIFIED", "EXPIRED", "REJECTED_FINAL", "CANCELLED"].includes(m.status)).length;
  const paid = ms.reduce((a, m) => a + BigInt(m.paid_wei || 0), 0n);
  const refunded = ms.reduce((a, m) => a + BigInt(m.refunded_wei || 0), 0n);
  const n = ms.length;

  return (
    <div className="mt-4">
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-panelInset"
        role="img"
        aria-label={`${verified} of ${n} milestones verified, ${settled} settled, ${weiToGen(paid)} GEN credited to builder of ${weiToGen(total)} GEN total${refunded > 0n ? `, ${weiToGen(refunded)} GEN credited to grantor` : ""}`}
      >
        {ms.map((m, i) => (
          <div
            key={i}
            className={`h-full flex-1 ${segmentTone(m)}`}
            title={`Milestone ${i + 1}: ${m.status}${m.paid_wei && BigInt(m.paid_wei) > 0n ? ` — ${weiToGen(m.paid_wei)} GEN credited` : ""}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-steel">
        {verified} of {n} verified · {settled} settled · {weiToGen(paid)} GEN credited to builder of{" "}
        {weiToGen(total)} GEN
        {refunded > 0n && <> · {weiToGen(refunded)} GEN credited to grantor</>}
      </p>
    </div>
  );
}
