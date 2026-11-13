// Protocol stats — all three numbers come from the contract overview and
// are authoritative. While the overview is null the line reads "…" (never
// a guessed number). Per-grantor / per-builder aggregates are NOT shown
// here: store.reputation is null until fullyLoaded, and partial-load
// numbers must never be presented as fact (filmed bug B3).
//
// UX round: the bar is a collapsed one-liner by default — "28 grants · 16
// assessed · 0.001 GEN locked" — tap to expand to the three tiles. The
// "Updated X min ago · Refresh" line is always visible: the timestamp is
// when the grants were last re-read from the chain, never a guess.
import React, { useEffect, useState } from "react";
import { useApp } from "../lib/store.jsx";
import { weiToGen } from "../lib/genlayer.js";
import { timeAgo } from "../lib/time.js";

function Stat({ label, value, accent }) {
  return (
    <div className="glass fade-up rounded-2xl px-4 py-3 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-steel">{label}</p>
      <p className={`mt-1 text-lg font-bold leading-snug ${accent ? "text-gradient" : ""}`}>{value}</p>
    </div>
  );
}

export default function StatsBar() {
  const { overview, grantsLoading, loadedCount, totalCount, loadError, refresh, updatedAt } = useApp();
  const [open, setOpen] = useState(false);
  // The "Updated X min ago" stamp only advances when this component
  // re-renders — with no tick it would sit on "just now" forever after
  // the load. A 30s tick keeps it honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // The overview field is total_escrow_wei on the current contract; fall
  // back to the older locked_wei name if a cached overview predates it.
  const escrowWei = overview ? overview.total_escrow_wei ?? overview.locked_wei : null;

  return (
    <section aria-label="Protocol stats" className="mx-auto w-full max-w-[720px] px-4 pt-4 sm:pt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm shadow-card transition hover:border-acid/60"
      >
        <span>
          {overview ? (
            <>
              <strong>{overview.grant_count} grants</strong> · {overview.total_assessed} assessed ·{" "}
              <strong>{escrowWei !== null && escrowWei !== undefined ? `${weiToGen(escrowWei)} GEN` : "…"}</strong> locked
            </>
          ) : (
            "Reading the contract…"
          )}
        </span>
        <span aria-hidden="true" className="shrink-0 text-steel">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Total grants" value={overview ? String(overview.grant_count) : "…"} />
          <Stat label="Milestones assessed" value={overview ? String(overview.total_assessed) : "…"} />
          <Stat
            label="Active escrow"
            value={escrowWei !== null && escrowWei !== undefined ? `${weiToGen(escrowWei)} GEN` : "…"}
            accent
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {!overview && (
          <p className="text-xs text-steel" role="status">
            Reading the contract from Bradbury — the first load takes a few seconds on mobile data, then
            the numbers appear.
          </p>
        )}
        {grantsLoading && totalCount > 0 && (
          <p className="text-xs font-semibold text-acid" role="status">
            Loading more grants… {loadedCount} of {totalCount}
          </p>
        )}
        {grantsLoading && totalCount === 0 && (
          <p className="text-xs font-semibold text-acid" role="status">
            Reading the contract…
          </p>
        )}
        {loadError && (
          <p className="text-xs font-semibold text-rose" role="alert">
            Could not refresh: {loadError}{" "}
            <button onClick={() => refresh()} className="underline">
              Try again
            </button>
          </p>
        )}
        <span className="text-xs text-steel">
          {updatedAt ? `Updated ${timeAgo(updatedAt)}` : "Not updated yet"}
        </span>
        <button onClick={() => refresh()} className="ml-auto text-xs font-semibold text-acid hover:underline">
          Refresh
        </button>
      </div>
    </section>
  );
}
