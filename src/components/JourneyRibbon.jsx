// The three steps, from contract to payout. Step states come from the
// store only: step 1 done when the wallet is connected, step 2 done when
// at least one grant exists on chain, step 3 done when any milestone has
// a jury verdict. The first incomplete step is the current one.
//
// UX round: on the FIRST visit this is the full ribbon; afterwards it
// collapses to a single "How GrantFlow works" link (the ribbon and the
// per-grant stepper described the same four steps twice). The link opens
// a bottom-sheet explainer with the same three steps. "Got it" dismisses
// the ribbon forever (localStorage grantflow.seenJourney).
import React, { useState } from "react";
import { useApp } from "../lib/store.jsx";

const STEPS = [
  { key: "connect", n: 1, title: "Connect wallet", text: "Your wallet signs every action — reading works without one." },
  { key: "fund", n: 2, title: "Fund a grant", text: "The grantor locks the exact GEN total as escrow." },
  { key: "verdict", n: 3, title: "Jury verdict, payout", text: "A 5-validator AI jury verifies the evidence and pays." },
];

export default function JourneyRibbon() {
  const { account, grants, overview } = useApp();
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem("grantflow.seenJourney") === "1";
    } catch {
      return false;
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const anyAssessed = (grants || []).some((g) => (g.milestones || []).some((m) => m.verdict));
  const done = [!!account, (grants || []).length > 0, anyAssessed];
  const currentIdx = done.findIndex((d) => !d);

  const dismiss = () => {
    setSeen(true);
    try {
      localStorage.setItem("grantflow.seenJourney", "1");
    } catch {}
  };

  if (!seen) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-4 sm:pt-6">
        <section aria-label="How GrantFlow works" className="glass fade-up rounded-3xl p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-steel">How GrantFlow works</p>
            <span className="text-[11px] font-semibold text-steel">
              {overview ? `${overview.grant_count} grants on Bradbury` : "GenLayer Bradbury"}
            </span>
          </div>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => {
              const isDone = done[i];
              const isCurrent = i === currentIdx;
              return (
                <li key={s.key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      isDone
                        ? "bg-acid text-acidInk"
                        : isCurrent
                          ? "border-2 border-acid bg-transparent text-acid"
                          : "border border-lineStrong bg-panel text-steel"
                    }`}
                  >
                    {isDone ? "✓" : s.n}
                  </span>
                  <span className="text-sm leading-snug">
                    <strong>{s.title}</strong>
                    <span className="block text-steel">{s.text}</span>
                    {isCurrent && (
                      <span className="mt-0.5 block text-xs font-semibold text-acid">You are here</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex justify-end">
            <button
              onClick={dismiss}
              className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-black"
            >
              Got it
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4 sm:pt-6">
      <button
        onClick={() => setSheetOpen(true)}
        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm font-semibold shadow-card transition hover:border-acid/60"
      >
        How GrantFlow works <span className="text-steel">· 3 steps · 1 min read ›</span>
      </button>
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-label="How GrantFlow works"
            className="w-full max-w-[720px] rounded-t-3xl border border-line bg-panel p-5 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">How GrantFlow works</h2>
              <button onClick={() => setSheetOpen(false)} className="text-sm font-bold text-steel">
                Close ✕
              </button>
            </div>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s) => (
                <li key={s.key} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acid text-sm font-bold text-acidInk"
                  >
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="text-sm text-steel">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-steel">
              Money only moves on a jury verdict — the grantor cannot pull it back once funded, and the
              builder cannot touch it until the jury says so.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
