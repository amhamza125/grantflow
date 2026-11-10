// Public Ledger — every grant, verdict, score, reasons and grounding receipt,
// filterable by verdict outcome. All rows come from get_grant reads on GrantFlow.
// Newest first. The "Credited" column says credited, not paid: paid_wei is
// money credited as claimable, received only after withdraw_claim lands on chain.
import React, { useMemo, useState } from "react";
import { explorerAddressUrl } from "../lib/config.js";
import { shortAddress, weiToGen } from "../lib/genlayer.js";

const FILTERS = [
  { key: "ALL", label: "All milestones" },
  { key: "MET", label: "MET" },
  { key: "PARTIAL", label: "PARTIAL" },
  { key: "NOT_MET", label: "NOT_MET" },
  { key: "EVIDENCE", label: "Evidence unreachable" },
];

function milestoneOutcome(m) {
  if (m.verdict) {
    const v = m.verdict.verdict || (m.verdict.met ? "MET" : "NOT_MET");
    if (v === "PARTIAL") return "PARTIAL";
    return m.verdict.met ? "MET" : "NOT_MET";
  }
  if ((m.evidence_failures || 0) > 0 || m.last_evidence_error) return "EVIDENCE";
  return "NONE";
}

export default function Ledger({ grants }) {
  const [filter, setFilter] = useState("ALL");

  const rows = useMemo(() => {
    const out = [];
    for (const g of grants) {
      for (const m of g.milestones) {
        const outcome = milestoneOutcome(m);
        if (filter !== "ALL" && outcome !== filter) continue;
        out.push({ grant: g, milestone: m, outcome });
      }
    }
    // Newest first — a ledger reads top-down.
    return out.reverse();
  }, [grants, filter]);

  const counts = useMemo(() => {
    const c = { ALL: 0, MET: 0, PARTIAL: 0, NOT_MET: 0, EVIDENCE: 0 };
    for (const g of grants) {
      for (const m of g.milestones) {
        c.ALL += 1;
        const o = milestoneOutcome(m);
        if (c[o] !== undefined) c[o] += 1;
      }
    }
    return c;
  }, [grants]);

  return (
    <section aria-label="Public ledger">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">Public Ledger</h2>
      <p className="mt-1 text-sm text-steel">
        Every milestone the contract has seen, with the jury&apos;s verdict, the grounding receipt, and what
        was credited (withdraw to receive it).
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter milestones by verdict">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
              filter === f.key ? "border-acid bg-acid text-acidInk shadow-glow" : "border-line bg-panel text-steel hover:border-acid/60 hover:text-mist"
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
          No milestones match this filter yet.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-lineStrong text-xs uppercase tracking-wide text-steel">
                <th className="py-2 pr-3">Grant</th>
                <th className="py-2 pr-3">Milestone</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Verdict</th>
                <th className="py-2 pr-3">Grounding receipt</th>
                <th className="py-2 pr-3">Credited</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ grant, milestone, outcome }, i) => {
                const depth = Math.min(i, 6);
                return (
                  <tr
                    key={`${grant.id}-${milestone.id}`}
                    className="border-b border-line align-top transition hover:bg-panel"
                    style={{ opacity: 1 - depth * 0.04, filter: depth > 0 ? `blur(${depth * 0.12}px)` : undefined }}
                  >
                    <td className="py-3 pr-3">
                      <p className="font-semibold">#{grant.id} — {grant.title}</p>
                      <p className="mt-1 font-mono text-xs text-steel">
                        grantor{" "}
                        <a className="underline" href={explorerAddressUrl(grant.grantor)} target="_blank" rel="noreferrer">
                          {shortAddress(grant.grantor)}
                        </a>
                        <br />
                        builder{" "}
                        <a className="underline" href={explorerAddressUrl(grant.builder)} target="_blank" rel="noreferrer">
                          {shortAddress(grant.builder)}
                        </a>
                      </p>
                      <p className="mt-1 text-xs">
                        <span className="font-semibold">Grant status:</span> {grant.status}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-mono text-xs">M{milestone.id} · {milestone.status}</p>
                      <p className="mt-1 max-w-72">{milestone.spec}</p>
                    </td>
                    <td className="py-3 pr-3 font-semibold">{weiToGen(milestone.amount_wei)} GEN</td>
                    <td className="py-3 pr-3">
                      {milestone.verdict ? (
                        <>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-line ${
                              milestone.verdict.met
                                ? "bg-mint/15 text-mint"
                                : (milestone.verdict.verdict || "") === "PARTIAL"
                                  ? "bg-gold/15 text-gold"
                                  : "bg-rose/15 text-rose"
                            }`}
                          >
                            {milestone.verdict.verdict || (milestone.verdict.met ? "MET" : "NOT_MET")}
                            {(milestone.verdict.verdict || "") === "PARTIAL"
                              ? ` · ${milestone.verdict.payout_pct}%`
                              : ""}
                          </span>
                          <p className="mt-1 text-xs">
                            score: {milestone.verdict.score === null || milestone.verdict.score === undefined ? "not recorded" : milestone.verdict.score}
                          </p>
                          {milestone.verdict.reasons && milestone.verdict.reasons.length > 0 && (
                            <p className="mt-1 max-w-72 text-xs">{milestone.verdict.reasons[0]}</p>
                          )}
                        </>
                      ) : outcome === "EVIDENCE" ? (
                        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold ring-1 ring-inset ring-line">
                          Evidence unreachable
                        </span>
                      ) : (
                        <span className="text-xs text-steel">No verdict yet</span>
                      )}
                      {milestone.evidence_failures > 0 && (
                        <p className="mt-1 text-xs">
                          Evidence fetch failed {milestone.evidence_failures}×
                          {milestone.last_evidence_error ? ` (${milestone.last_evidence_error})` : ""}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">
                      {milestone.verdict && milestone.verdict.grounding ? (
                        <>
                          fetched: {milestone.verdict.grounding.artifacts_fetched}
                          <br />
                          <span className="break-all">{milestone.verdict.grounding.primary_sha256}</span>
                        </>
                      ) : (
                        <span className="text-steel">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-semibold">
                      {weiToGen(milestone.paid_wei)} GEN
                      {milestone.refunded_wei && BigInt(milestone.refunded_wei) > 0n && (
                        <span className="block text-xs font-normal text-steel">
                          refunded {weiToGen(milestone.refunded_wei)} GEN
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
