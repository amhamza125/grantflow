// The grant feed: Featured first (AI-assessed grants), search, "My
// grants only", the Filter sheet, "Your turn", the sticky "+ New grant"
// button. Renders store.visibleGrants exactly as given — the store
// already dedups, so this file never dedups again and never renders the
// same id twice. When there are no cached grants on first paint, at most
// 3 small inline placeholder rows appear — never a whole-page skeleton
// wall.
//
// UX round: the default feed is Featured (hasAssessedVerdict); test /
// cancelled records sit behind "All grants". The remaining status filters
// (Assessed / Active / Completed / My grants) live behind one "Filter"
// chip that opens a bottom sheet, and the "Show early test records"
// toggle moved inside that sheet.
import React, { useState } from "react";
import { useApp } from "../lib/store.jsx";
import { grantCardSummary } from "../lib/grants.js";
import { deadlineDate } from "../lib/time.js";
import GrantCard from "./GrantCard.jsx";

const VISIBLE_FILTERS = [
  { key: "FEATURED", label: "Featured" },
  { key: "ALL", label: "All grants" },
];

const SHEET_FILTERS = [
  { key: "ASSESSED", label: "Assessed", hint: "Grants with a jury verdict on at least one milestone." },
  { key: "ACTIVE", label: "Active", hint: "Funded grants waiting on evidence or a verdict." },
  { key: "COMPLETED", label: "Completed", hint: "Grants that are complete or cancelled." },
  { key: "MINE", label: "My grants", hint: "Grants where you are the grantor or the builder." },
];

export default function GrantList() {
  const {
    visibleGrants,
    feedCounts,
    feedFilter,
    setFeedFilter,
    hiddenTestCount,
    showTestGrants,
    setShowTestGrants,
    grantsLoading,
    loadedCount,
    totalCount,
    listReady,
    loadError,
    failedIds,
    retryGrant,
    refresh,
    grants,
    searchQuery,
    setSearchQuery,
    myGrantsOnly,
    setMyGrantsOnly,
    yourTurn,
    account,
    selectGrant,
    requestEvidence,
    onAssess,
    onRelease,
    onAppeal,
    onExpire,
    setShowCreate,
    claimable,
    pending,
    clearBuilderFilter,
    builderFilter,
  } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);

  const showPlaceholders = !listReady && visibleGrants.length === 0 && grantsLoading;
  const isEmpty = !grantsLoading && visibleGrants.length === 0 && failedIds.length === 0 && listReady;
  const filtersActive =
    feedFilter !== "FEATURED" || searchQuery.trim() !== "" || myGrantsOnly;
  // A search, "My grants only", or a builder filter is active — the empty
  // state must say "no match", never "no assessed grants yet" (the
  // contract HAS assessed grants; the search found none).
  const searchActive =
    searchQuery.trim() !== "" || myGrantsOnly || builderFilter !== null;
  // The floating withdrawal pill (App.jsx) sits fixed at the bottom — the
  // sticky "+ New grant" button clears it.
  const pillVisible = !!account && (pending || claimable > 0n);

  const clearFilters = () => {
    setFeedFilter("FEATURED");
    setSearchQuery("");
    setMyGrantsOnly(false);
    clearBuilderFilter();
  };

  const runTurnAction = (item) => {
    const g = item.grant;
    const cur = Number(g.current_milestone || 0);
    if (item.action === "fund") {
      selectGrant(Number(g.id));
      requestAnimationFrame(() =>
        document.getElementById("grant-file")?.scrollIntoView({ behavior: "auto", block: "start" })
      );
    } else if (item.action === "evidence") {
      selectGrant(Number(g.id));
      requestEvidence(Number(g.id));
    } else if (item.action === "assess") {
      onAssess(g, cur);
    } else if (item.action === "release") {
      onRelease(g, cur);
    } else if (item.action === "appeal") {
      onAppeal(g, cur);
    } else if (item.action === "expire") {
      onExpire(g, cur);
    }
  };

  return (
    <section aria-label="Grants" className="mt-4">
      {/* Search + "My grants only" */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title, grant # or address…"
          aria-label="Search grants by title, number or address"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm text-mist placeholder:text-steel focus:border-acid focus:outline-none"
        />
        <button
          onClick={() => setMyGrantsOnly((v) => !v)}
          aria-pressed={myGrantsOnly}
          disabled={!account}
          title={account ? "Show only grants where you are the grantor or the builder" : "Connect a wallet first"}
          className={`shrink-0 rounded-full border px-3 py-2.5 text-xs font-bold transition ${
            myGrantsOnly
              ? "border-acid bg-acid/15 text-acid"
              : "border-line bg-panel text-steel"
          } disabled:opacity-40`}
        >
          My grants{myGrantsOnly ? " ✓" : ""}
        </button>
      </div>

      {/* Visible pills: Featured / All + the Filter chip */}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter grants">
        {VISIBLE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFeedFilter(f.key)}
            aria-pressed={feedFilter === f.key}
            className={`pill ${feedFilter === f.key ? "pill--active" : ""}`}
          >
            {f.label} ({feedCounts[f.key] ?? 0})
          </button>
        ))}
        <button
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          className={`pill ${["ASSESSED", "ACTIVE", "COMPLETED", "MINE"].includes(feedFilter) ? "pill--active" : ""}`}
        >
          Filter ▾
        </button>
      </div>
      <p className="mt-2 text-xs text-steel">
        {feedFilter === "FEATURED"
          ? "Grants the AI jury has already judged — MET or PARTIAL verdicts, newest first."
          : feedFilter === "ALL"
            ? "All grants on the contract, newest first."
            : feedFilter === "MINE"
              ? "Grants where you are the grantor or the builder."
              : feedFilter === "ASSESSED"
                ? "Grants with a jury verdict on at least one milestone."
                : feedFilter === "ACTIVE"
                  ? "Funded grants waiting on evidence or a verdict."
                  : "Grants that are complete or cancelled."}
      </p>

      {loadError && (
        <div role="alert" className="mt-3 rounded-2xl border border-rose/40 bg-rose/10 p-4 text-sm shadow-card">
          <p className="font-semibold">Could not read the contract</p>
          <p className="mt-1 break-words">{loadError}</p>
          <button onClick={() => refresh()} className="btn-primary mt-3 px-4 py-2.5 text-sm">
            Try again
          </button>
        </div>
      )}

      {grantsLoading && totalCount > 0 && (
        <p className="mt-3 text-xs font-semibold text-acid" role="status">
          Reading the contract… {loadedCount} of {totalCount} grants
        </p>
      )}

      {/* Your turn — grants where the connected wallet is a party and an
          action is waiting on them. */}
      {yourTurn.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-steel">Your turn</p>
          <div className="mt-2 space-y-2">
            {yourTurn.map((item) => {
              const g = item.grant;
              const summary = grantCardSummary(g, account);
              // The "couldn't agree yet" note (approved mockup): prior
              // assessment attempts on this grant, from the tx list — a
              // disagreed attempt leaves no on-chain trace. A SUBMITTED
              // milestone expires at deadline + 1800s grace.
              const curM = (g.milestones || [])[Number(g.current_milestone)] || null;
              const dl = Number(curM?.deadline || 0);
              const expirySec =
                dl > 0 ? dl + (String(curM?.status) === "SUBMITTED" ? 1800 : 0) : 0;
              return (
                <div
                  key={g.id}
                  className="rounded-2xl border border-acid/40 bg-acid/10 px-3 py-3 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => selectGrant(Number(g.id))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-bold">
                        Grant #{g.id} · {g.title || "Untitled grant"}
                      </span>
                      <span className="mt-0.5 block text-xs text-steel">
                        {summary.totalGen} GEN
                        {summary.context.length > 0 ? ` · ${summary.context[0]}` : ""}
                        {summary.youRole ? ` · You (${summary.youRole})` : ""}
                      </span>
                    </button>
                    <button onClick={() => runTurnAction(item)} className="btn-primary shrink-0 px-3 py-2 text-xs">
                      {item.label}
                    </button>
                  </div>
                  {item.action === "assess" && item.attempts > 0 && (
                    <p className="mt-2 text-xs text-steel">
                      Jury couldn&apos;t agree yet — {item.attempts} assessment attempt
                      {item.attempts === 1 ? "" : "s"} on this grant, no verdict yet.
                      {expirySec > 0 ? ` Expires ${deadlineDate(expirySec)}.` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {showPlaceholders && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-row" aria-hidden="true">
                <span className="skeleton-row__line skeleton-row__line--short" />
                <span className="skeleton-row__line" />
                <span className="skeleton-row__line skeleton-row__line--short" />
              </div>
            ))}
            <p className="text-xs text-steel" role="status">
              Reading the contract… first grants arriving.
            </p>
          </>
        )}

        {visibleGrants.map((g) => (
          <GrantCard key={g.id} grant={g} />
        ))}

        {failedIds.map((id) => (
          <button
            key={`failed-${id}`}
            onClick={() => retryGrant(id)}
            className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-rose/40 bg-rose/10 px-4 py-3 text-left text-sm transition hover:border-rose/60"
            title={`Grant #${id} failed to load — tap to retry`}
          >
            <span className="font-mono text-xs font-semibold text-rose">#{id} · failed to load</span>
            <span className="ml-auto text-xs font-semibold text-rose">Tap to retry</span>
          </button>
        ))}

        {isEmpty && grants.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
            No grants on chain yet. Create the first one — you are the grantor, and you fund it.
          </div>
        )}
        {isEmpty && grants.length > 0 && feedFilter === "FEATURED" && !searchActive && (
          <div className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
            <p className="font-semibold text-mist">No AI-assessed grants yet</p>
            <p className="mt-1">Nothing on this contract has a jury verdict so far.</p>
            <button onClick={() => setFeedFilter("ALL")} className="btn-primary mt-3 px-4 py-2 text-xs">
              Show all grants
            </button>
          </div>
        )}
        {isEmpty && grants.length > 0 && (feedFilter !== "FEATURED" || searchActive) && (
          <div className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
            <p className="font-semibold text-mist">No grants match this filter yet</p>
            {filtersActive && (
              <button onClick={clearFilters} className="btn-primary mt-3 px-4 py-2 text-xs">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky "+ New grant" — always within reach at the bottom of the list. */}
      <div
        className="sticky z-30 mt-4"
        style={{ bottom: pillVisible ? 76 : 12 }}
      >
        <button
          onClick={() => {
            setShowCreate(true);
            requestAnimationFrame(() =>
              document.getElementById("create-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
            );
          }}
          className="btn-primary w-full py-3 text-sm font-bold shadow-lg"
        >
          + New grant
        </button>
      </div>

      {/* Filter sheet: the remaining status filters + the early-test toggle. */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Filter grants"
            className="w-full max-w-[720px] rounded-t-3xl border border-line bg-panel p-5 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Filter grants</h2>
              <button onClick={() => setSheetOpen(false)} className="text-sm font-bold text-steel">
                Close ✕
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {SHEET_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFeedFilter(f.key);
                    setSheetOpen(false);
                  }}
                  aria-pressed={feedFilter === f.key}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    feedFilter === f.key ? "border-acid bg-acid/10" : "border-line bg-panel"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {f.label} ({feedCounts[f.key] ?? 0})
                    </span>
                    <span className="block text-xs text-steel">{f.hint}</span>
                  </span>
                  {feedFilter === f.key && <span aria-hidden="true" className="text-acid">✓</span>}
                </button>
              ))}
            </div>
            {hiddenTestCount > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <button
                  onClick={() => setShowTestGrants(!showTestGrants)}
                  aria-expanded={showTestGrants}
                  className="text-xs font-semibold text-steel hover:underline"
                >
                  {showTestGrants
                    ? "▾ Hide early test records"
                    : `▸ Show early test records (${hiddenTestCount})`}
                </button>
              </div>
            )}
            {filtersActive && (
              <button onClick={() => { clearFilters(); setSheetOpen(false); }} className="mt-4 w-full rounded-full border border-line px-4 py-2.5 text-sm font-bold">
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
