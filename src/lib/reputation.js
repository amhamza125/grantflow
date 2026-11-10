// On-ledger reputation ribbons — computed only from the grants loaded from
// the contract (the app reads every grant, so this is the full on-chain
// history, not a sample).
//
// Builder ribbon: MET rate across assessed milestones + evidence reliability.
// Grantor ribbon: grants created + grants completed.
// NOT included: appeal overturn rate — the contract stores only the current
// verdict, not the pre-appeal one, so an overturn cannot be computed without
// inventing data. That stays out until the contract records verdict history.
export function buildReputation(grants) {
  const byBuilder = {};
  const byGrantor = {};
  for (const g of grants || []) {
    const bKey = String(g.builder || "").toLowerCase();
    if (bKey && !byBuilder[bKey]) {
      byBuilder[bKey] = { address: g.builder, assessed: 0, met: 0, partial: 0, notMet: 0, evidenceFailures: 0, appeals: 0 };
    }
    const bb = byBuilder[bKey];
    if (bb) {
      for (const m of g.milestones || []) {
        if (m.verdict) {
          bb.assessed += 1;
          const v = m.verdict.verdict || (m.verdict.met ? "MET" : "NOT_MET");
          if (v === "MET") bb.met += 1;
          else if (v === "PARTIAL") bb.partial += 1;
          else bb.notMet += 1;
          if (m.verdict.appealed) bb.appeals += 1;
        }
        bb.evidenceFailures += Number(m.evidence_failures || 0);
      }
    }
    const gKey = String(g.grantor || "").toLowerCase();
    if (gKey && !byGrantor[gKey]) {
      byGrantor[gKey] = { address: g.grantor, grants: 0, complete: 0 };
    }
    const gb = byGrantor[gKey];
    if (gb) {
      gb.grants += 1;
      if (g.status === "COMPLETE") gb.complete += 1;
    }
  }
  return { byBuilder, byGrantor };
}

export function builderRibbonText(r) {
  if (!r || r.assessed === 0) return "No verdicts yet on this contract";
  const parts = [`${r.met}/${r.assessed} MET`];
  if (r.partial > 0) parts.push(`${r.partial} partial`);
  if (r.notMet > 0) parts.push(`${r.notMet} not met`);
  parts.push(r.evidenceFailures > 0 ? `evidence failed ${r.evidenceFailures}×` : "evidence clean");
  return parts.join(" · ");
}

export function grantorRibbonText(r) {
  if (!r) return "";
  return `${r.grants} grant${r.grants === 1 ? "" : "s"} · ${r.complete} complete`;
}
