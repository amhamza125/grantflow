import React, { useMemo, useState } from "react";
import { explorerAddressUrl } from "../lib/config.js";
import { shortAddress, weiToGen } from "../lib/genlayer.js";

// Public Ledger — every grant, verdict, score, reasons and grounding receipt,
// filterable by verdict outcome. All rows come from get_grant reads on v2.2.
const FILTERS = [
  { key: "ALL", label: "All grants" },
  { key: "MET", label: "MET" },
  { key: "NOT_MET", label: "NOT_MET" },
  { key: "EVIDENCE", label: "Evidence unreachable" },
];

function milestoneOutcome(m) {
  if (m.verdict) return m.verdict.met ? "MET" : "NOT_MET";
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
    return out;
  }, [grants, filter]);

  const counts = useMemo(() => {
    const c = { ALL: 0, MET: 0, NOT_MET: 0, EVIDENCE: 0 };
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
    <div>
      <h2 className="font-display text-2xl font-bold">Public Ledger</h2>
      <p className="mt-1 text-sm text-inksoft">
        Every milestone the contract has seen, with the jury&apos;s verdict, the grounding receipt, and what
        was paid. Nothing here is typed by hand — it is all read from GMV v2.2.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              filter === f.key ? "border-pine bg-pine text-white" : "border-rule bg-paper hover:border-pine"
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-inksoft">No milestones match this filter yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-inksoft">
                <th className="py-2 pr-3">Grant</th>
                <th className="py-2 pr-3">Milestone</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Verdict</th>
                <th className="py-2 pr-3">Grounding receipt</th>
                <th className="py-2 pr-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ grant, milestone, outcome }) => (
                <tr key={`${grant.id}-${milestone.id}`} className="border-b border-rule align-top">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">#{grant.id} — {grant.title}</p>
                    <p className="mt-1 font-mono text-xs text-inksoft">
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
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            milestone.verdict.met ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
                          }`}
                        >
                          {milestone.verdict.met ? "MET" : "NOT_MET"}
                        </span>
                        <p className="mt-1 text-xs">
                          score: {milestone.verdict.score === null || milestone.verdict.score === undefined ? "not recorded" : milestone.verdict.score}
                        </p>
                        {milestone.verdict.reasons && milestone.verdict.reasons.length > 0 && (
                          <p className="mt-1 max-w-72 text-xs">{milestone.verdict.reasons[0]}</p>
                        )}
                      </>
                    ) : outcome === "EVIDENCE" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        Evidence unreachable
                      </span>
                    ) : (
                      <span className="text-xs text-inksoft">No verdict yet</span>
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
                      <span className="text-inksoft">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 font-semibold">
                    {weiToGen(milestone.paid_wei)} GEN
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
