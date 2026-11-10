// Steward risk scoring — computed only from on-chain fields of each grant's
// current milestone. The rule is transparent and shown on every cell, so the
// colour is never a black box:
//   +2  deadline passed, or under 24h away
//   +1  deadline 1–7 days away
//   +1  evidence fetch failed at least once on the current milestone
//   +1  the one appeal was already used (the verdict is final)
// Tiers: 0 points = calm, 1 = watch, 2+ = attention.
export function grantRisk(grant, nowSec) {
  const current = grant.milestones
    ? grant.milestones[Number(grant.current_milestone)] || null
    : null;
  const factors = [];
  let points = 0;
  if (current) {
    const d = Number(current.deadline || 0);
    if (d > 0) {
      const daysLeft = (d - nowSec) / 86400;
      if (daysLeft <= 0) {
        points += 2;
        factors.push("deadline passed");
      } else if (daysLeft < 1) {
        points += 2;
        factors.push("deadline under 24h");
      } else if (daysLeft <= 7) {
        points += 1;
        factors.push(`deadline ${Math.ceil(daysLeft)}d away`);
      }
    }
    if (Number(current.evidence_failures || 0) > 0) {
      points += 1;
      factors.push(`evidence failed ${current.evidence_failures}×`);
    }
    if (current.verdict && current.verdict.appealed) {
      points += 1;
      factors.push("appeal used — verdict final");
    }
  }
  const tier = points === 0 ? "calm" : points === 1 ? "watch" : "attention";
  return { points, tier, factors, current };
}

export function activeGrants(grants) {
  return (grants || []).filter((g) => ["FUNDED", "PENDING_FUNDING"].includes(g.status));
}
