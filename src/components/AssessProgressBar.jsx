// Live assess progress bar — shown while an assess_milestone tx is in
// flight. Pure presentational: it takes the store's assessProgress object
// and renders the stage bar. Stage names come from TX_STAGES (verified
// against the SDK TransactionStatus enum + the scan API's lowercase status
// field) — the bar shows the stage the chain actually reported, never a
// guessed one.
//
// Stages: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED.
// A failed run (terminal-bad status) shows the failure honestly.
import React from "react";
import { TX_STAGES } from "../lib/txlinks.js";

export default function AssessProgressBar({ progress }) {
  if (!progress) return null;
  const stages = TX_STAGES;
  const current = Math.max(0, Math.min(progress.stageIndex ?? 0, stages.length - 1));
  const failed = !!progress.failed;
  const done = !progress.active && !failed;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-panelStrong px-3 py-3" role="status">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">
          {failed
            ? "Assessment stalled"
            : done
              ? "Assessment finalized"
              : "Jury is working — live"}
        </p>
        <span className={`text-xs font-bold ${failed ? "text-rose" : "text-acid"}`}>
          {failed
            ? "did not finalize"
            : `${stages[current].charAt(0) + stages[current].slice(1).toLowerCase()} · ${current + 1} of ${stages.length}`}
        </span>
      </div>
      {/* Stage bar — each segment fills as its stage is reached. */}
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {stages.map((s, i) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full ${
              failed
                ? i <= current
                  ? "bg-rose"
                  : "bg-line"
                : i < current
                  ? "bg-mint"
                  : i === current
                    ? done
                      ? "bg-mint"
                      : "bg-gold"
                    : "bg-line"
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {stages.map((s, i) => (
          <span
            key={s}
            className={`text-[11px] font-semibold ${
              i === current ? (failed ? "text-rose" : "text-ink") : i < current ? "text-mint" : "text-steel"
            }`}
          >
            {i < current ? "✓ " : i === current ? "● " : "○ "}
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-steel">
        {failed
          ? "The assessment transaction did not finalize on chain. No funds moved — you can try assessing again once the milestone is still open."
          : done
            ? "The jury's verdict is below. The transaction finalized on chain."
            : "The validators are reaching consensus on this milestone. The verdict appears below when it finalizes — no refresh needed."}
      </p>
    </div>
  );
}
