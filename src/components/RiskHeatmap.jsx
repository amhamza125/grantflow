// Steward risk heatmap.
// One cell per active grant, coloured by a transparent risk rule computed
// from on-chain fields only (see lib/risk.js). Every cell lists the factors
// behind its colour, and clicking a cell opens that grant file — a real
// control, not decoration.
import React from "react";
import { useNow } from "../lib/time.js";
import { grantRisk, activeGrants } from "../lib/risk.js";

const TIER_STYLE = {
  calm: "border-mint/40 bg-mint/10 text-mint",
  watch: "border-gold/40 bg-gold/10 text-gold",
  attention: "border-rose/40 bg-rose/10 text-rose",
};

const TIER_LABEL = {
  calm: "Calm",
  watch: "Watch",
  attention: "Attention",
};

export default function RiskHeatmap({ grants, selectedId, onSelect }) {
  const now = useNow(30000);
  const active = activeGrants(grants);
  if (active.length === 0) return null;

  return (
    <section className="mt-4" aria-label="Steward risk heatmap">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-display text-lg font-bold">Steward view — active grants</h3>
        <p className="text-xs text-steel">
          Colour comes from the deadline, appeal use and evidence failures on chain — tap a cell to open
          the grant.
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {active.map((g) => {
          const { tier, factors } = grantRisk(g, now);
          const isSelected = Number(selectedId) === Number(g.id);
          return (
            <button
              key={g.id}
              onClick={() => onSelect(Number(g.id))}
              aria-pressed={isSelected}
              aria-label={`Grant ${g.id}, ${g.title}, risk ${TIER_LABEL[tier]}. ${factors.length ? "Factors: " + factors.join(", ") + "." : "No risk factors."}`}
              title={factors.length ? factors.join(" · ") : "No risk factors on chain"}
              className={`rounded-2xl border p-3 text-left transition hover:brightness-110 active:scale-[0.98] ${
                TIER_STYLE[tier]
              } ${isSelected ? "ring-2 ring-acid/70" : ""}`}
            >
              <span className="block font-mono text-xs opacity-80">#{g.id} · {g.status}</span>
              <span className="mt-0.5 block truncate text-sm font-bold text-mist">{g.title}</span>
              <span className="mt-1 block text-xs font-bold">{TIER_LABEL[tier]}</span>
              <span className="mt-0.5 block text-xs leading-snug text-steel">
                {factors.length ? factors.join(" · ") : "No risk factors on chain"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-steel">
        Rule: deadline passed or under 24h +2 · deadline 1–7 days +1 · evidence failed +1 · appeal already
        used +1. Calm 0, watch 1, attention 2+.
      </p>
    </section>
  );
}
