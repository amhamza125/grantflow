// Grant progress stepper — Funded → Evidence → Jury → Payout.
// Reads ONLY progressFor(grant) from lib/activity.js. No other data source.
import React from "react";
import { progressFor } from "../lib/activity.js";

const DOT_STYLE = {
  done: "bg-acid text-acidInk",
  current: "bg-acid text-acidInk animate-pulse ring-4 ring-acid/25",
  waiting: "bg-panelStrong text-steel ring-1 ring-inset ring-line",
  failed: "bg-rose text-white",
};

const DOT_MARK = {
  done: "✓",
  current: "●",
  waiting: "○",
  failed: "✗",
};

const LABEL_STYLE = {
  done: "text-mist",
  current: "font-bold text-mist",
  waiting: "text-steel",
  failed: "font-bold text-rose",
};

export default function GrantProgress({ grant }) {
  const steps = progressFor(grant);
  if (!grant || steps.length === 0) return null;

  // Tappable steps (UX round): a done step scrolls to the part of the
  // file it describes. Funded → the file top; Evidence → the current
  // milestone; Jury → the verdict card (falling back to the milestone
  // when no verdict card is rendered); Payout → the current milestone
  // (where the credited/refunded lines live). Waiting steps are not
  // buttons — there is nothing to scroll to yet.
  const cur = Number(grant.current_milestone || 0);
  const hasVerdictCard = (grant.milestones || []).some(
    (m) => m.verdict || Number(m.assess_attempts || 0) > 0
  );
  const targetFor = (key) => {
    if (key === "funded") return "grant-file";
    if (key === "jury") return hasVerdictCard ? `verdict-${cur}` : `milestone-${cur}`;
    return `milestone-${cur}`;
  };
  const scrollTo = (key) => {
    const el = document.getElementById(targetFor(key));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mt-4" aria-label="Grant progress">
      <div className="relative">
        {/* Connector line behind the dots */}
        <div
          className="absolute left-6 right-6 top-3 h-0.5 bg-panelStrong"
          aria-hidden="true"
        />
        <ol className="relative grid grid-cols-4 gap-1">
          {steps.map((s, i) => {
            const tappable = s.state === "done";
            const inner = (
              <>
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${DOT_STYLE[s.state] || DOT_STYLE.waiting}`}
                  aria-label={`${s.label}: ${s.state}${s.note ? ` — ${s.note}` : ""}`}
                  title={s.note || s.label}
                >
                  {DOT_MARK[s.state] || (i + 1)}
                </span>
                <span className={`mt-1.5 text-xs leading-tight ${LABEL_STYLE[s.state] || ""}`}>
                  {s.label}
                </span>
                {s.note && (
                  <span className="mt-0.5 text-[11px] leading-tight text-steel">{s.note}</span>
                )}
              </>
            );
            return (
              <li key={s.key} className="flex flex-col items-center text-center">
                {tappable ? (
                  <button
                    onClick={() => scrollTo(s.key)}
                    className="flex flex-col items-center text-center rounded-xl px-1 py-1 transition hover:bg-panel"
                    aria-label={`${s.label} — tap to jump to it`}
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
