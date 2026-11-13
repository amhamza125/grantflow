// One grant in the feed — three lines, no more. "Grant #N" is the
// PRIMARY line — never the title first: grants #0 and #6 share the
// byte-identical title "GrantFlow v3.4 multi-link grounding gate", which
// read as a duplicate when the title led. Amounts are GEN, never wei.
//   Line 1: Grant #N + title (truncated) + ONE badge — the verdict badge
//           "{verdict} · {pct}%" when a milestone has a jury verdict, else
//           the status chip.
//   Line 2: the four progress dots (done=acid, current=gold, waiting=
//           panelStrong, failed=rose) — labels live in the detail.
//   Line 3: total GEN + a context bit (released / refunded / evidence
//           links / files fetched) + a "You (Grantor)"/"You (Builder)" tag
//           when the connected wallet is a party.
// Party addresses, dates and the countdown chip are removed from the card
// — they live in the detail. Line 3 is computed by grantCardSummary()
// (src/lib/grants.js), shared with the "Your turn" cards.
// Click selects the grant in the store; the detail renders below the list.
import React from "react";
import { useApp } from "../lib/store.jsx";
import { progressFor } from "../lib/activity.js";
import { grantCardSummary } from "../lib/grants.js";

const STATUS_TONE = {
  PENDING_FUNDING: "chip--warn",
  FUNDED: "chip--info",
  COMPLETE: "chip--good",
  CANCELLED: "chip--bad",
  EXPIRED: "chip--bad",
};

const DOT_STATE = {
  done: "progress-dot--done",
  current: "progress-dot--current",
  waiting: "progress-dot--waiting",
  failed: "progress-dot--failed",
};

export default function GrantCard({ grant }) {
  const { selectedId, selectGrant, account } = useApp();
  const id = Number(grant.id);
  const isSelected = Number(selectedId) === id;
  const steps = progressFor(grant);
  const summary = grantCardSummary(grant, account);
  const milestones = grant.milestones || [];
  const judged = milestones.find((m) => m.verdict);
  const verdictName = judged?.verdict?.verdict || (judged?.verdict?.met ? "MET" : null);
  const verdictPct = judged?.verdict?.payout_pct;

  const open = () => {
    selectGrant(id);
    requestAnimationFrame(() => {
      document.getElementById("grant-file")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  return (
    <article
      id={`grant-card-${id}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Grant ${id}, ${grant.status}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`gf-card cursor-pointer ${isSelected ? "gf-card--selected" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="flex min-w-0 items-baseline gap-2 font-display text-lg font-bold leading-tight">
          <span className="shrink-0">Grant #{id}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-steel">{grant.title || "Untitled grant"}</span>
        </h3>
        {judged && verdictName ? (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {verdictName}
            {verdictPct !== undefined && verdictPct !== null ? ` · ${verdictPct}%` : ""}
          </span>
        ) : (
          <span className={`chip ml-auto shrink-0 ${STATUS_TONE[String(grant.status)] || "chip--info"}`}>
            {grant.status}
          </span>
        )}
      </div>

      <ol className="progress-dots mt-3" aria-label="Grant progress: funded, evidence, jury, payout">
        {steps.map((s) => (
          <li key={s.key} className="progress-step" title={`${s.label}: ${s.note}`}>
            <span aria-hidden="true" className={`progress-dot ${DOT_STATE[s.state] || ""}`}>
              {s.state === "done" ? "✓" : s.state === "failed" ? "✕" : ""}
            </span>
            <span className="progress-label">{s.label}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
        <span>
          <strong className="text-mist">{summary.totalGen} GEN</strong>
        </span>
        {summary.context.map((c) => (
          <span key={c}>{c}</span>
        ))}
        {summary.youRole && (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-bold text-teal-600 dark:text-teal-400">
            You ({summary.youRole})
          </span>
        )}
      </p>
    </article>
  );
}
