// Activity timeline — THE shared timeline used by both the Ledger and the
// grant file. One visual language, not two designs.
//
// Each entry is a card: a status chip (type + tone from kindOf), a verdict
// icon when verdictInfo() returns one, the plain sentence from
// describeText(), and the link from txLinkFor(entry, txLinks) — exact links
// say "View on Explorer", approximate links say "Likely transaction", and
// entries with no match fall back to "View contract on Explorer". No raw
// wei, no raw enums, no 40-hex addresses in the list — amounts are GEN,
// inside the sentence.
//
// Admin entries (PAUSE / RESUME / SWEEP / TRANSFER_OWNERSHIP) go behind a
// collapsed "Protocol events" toggle when showAdminToggle is true; when it
// is false they render inline, so nothing is ever silently dropped.
// Entries are newest-first: the store's activity array is oldest-first, so
// a copy is reversed — the store array is never mutated.
import React, { useMemo, useState } from "react";
import { describeText, verdictInfo, kindOf, splitAdmin, ledgerCategory } from "../lib/activity.js";
import { txLinkFor } from "../lib/txlinks.js";
import VerdictBadge from "./VerdictBadge.jsx";

const KIND_STYLE = {
  good: "bg-mint/15 text-mint",
  warn: "bg-gold/15 text-gold",
  bad: "bg-rose/15 text-rose",
  info: "bg-cyan/15 text-cyan",
  admin: "bg-panelStrong text-steel",
};

function EntryCard({ entry, txLinks }) {
  const kind = kindOf(entry.type);
  const verdict = verdictInfo(entry);
  const link = txLinkFor(entry, txLinks);
  return (
    <li className="rounded-2xl border border-line bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ring-line ${KIND_STYLE[kind] || KIND_STYLE.info}`}
        >
          {entry.type || "EVENT"}
        </span>
        {verdict && <VerdictBadge verdict={verdict} />}
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={
            link.exact
              ? "Open this transaction on the Bradbury explorer"
              : link.hash
                ? "Matched by order — this is the most likely transaction for this entry, not a proven exact match"
                : "Open the contract on the Bradbury explorer"
          }
          className="ml-auto shrink-0 text-xs font-semibold text-acid hover:underline"
        >
          {link.label} ↗
        </a>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed">{describeText(entry)}</p>
    </li>
  );
}

export default function ActivityTimeline({
  entries,
  txLinks,
  showAdminToggle = false,
  title,
  loading = false,
  filterable = false,
  pageSize = null,
}) {
  const [showProtocol, setShowProtocol] = useState(false);
  // Ledger filter (UX round): one pill per category, counts computed live
  // from the matched entries — never from tx counts (a tx count is not an
  // entry count). "Show older (N more)" reveals the rest of the filtered
  // list; the page resets when the category changes.
  const [category, setCategory] = useState("all");
  const [expanded, setExpanded] = useState(false);

  // Newest first — reverse a copy, never mutate the store array.
  const { main, admin } = useMemo(() => {
    const newestFirst = [...(entries || [])].reverse();
    return splitAdmin(newestFirst);
  }, [entries]);

  // Without the toggle, admin entries stay visible inline — dropping them
  // silently would hide real protocol events.
  const visibleMain = showAdminToggle ? main : [...main, ...admin];
  const counts = useMemo(() => {
    const c = { all: visibleMain.length, funds: 0, evidence: 0, jury: 0, payout: 0 };
    for (const e of visibleMain) {
      const cat = ledgerCategory(e.type);
      if (cat && cat in c) c[cat] += 1;
    }
    return c;
  }, [visibleMain]);
  const filteredMain = useMemo(() => {
    if (!filterable || category === "all") return visibleMain;
    return visibleMain.filter((e) => ledgerCategory(e.type) === category);
  }, [visibleMain, filterable, category]);
  const shownMain =
    filterable && pageSize && !expanded ? filteredMain.slice(0, pageSize) : filteredMain;
  const hiddenCount = filteredMain.length - shownMain.length;
  const showToggle = showAdminToggle && admin.length > 0;
  const isEmpty = filteredMain.length === 0 && !showToggle;

  return (
    <div>
      {title && <h3 className="font-display text-lg font-bold">{title}</h3>}
      {filterable && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
          {[
            { key: "all", label: "All" },
            { key: "funds", label: "Funds" },
            { key: "evidence", label: "Evidence" },
            { key: "jury", label: "Jury" },
            { key: "payout", label: "Payout" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setCategory(f.key);
                setExpanded(false);
              }}
              aria-pressed={category === f.key}
              className={`pill ${category === f.key ? "pill--active" : ""}`}
            >
              {f.label} ({counts[f.key] ?? 0})
            </button>
          ))}
        </div>
      )}
      {loading && isEmpty ? (
        <p
          role="status"
          className="mt-2 rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel"
        >
          Loading activity from chain…
        </p>
      ) : isEmpty ? (
        <p className="mt-2 rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
          No activity yet.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {shownMain.map((a) => (
            <EntryCard key={`${a.seq ?? "no-seq"}-${a.type}`} entry={a} txLinks={txLinks} />
          ))}
        </ol>
      )}
      {filterable && pageSize && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-bold transition hover:border-acid/60"
        >
          Show older ({hiddenCount} more)
        </button>
      )}
      {showToggle && (
        <div className="mt-3">
          <button
            onClick={() => setShowProtocol((s) => !s)}
            aria-expanded={showProtocol}
            className="text-sm font-semibold text-acid hover:underline"
          >
            {showProtocol ? "▾ Hide protocol events" : `▸ Protocol events (${admin.length})`}
          </button>
          {showProtocol && (
            <ol className="mt-2 space-y-2">
              {admin.map((a) => (
                <EntryCard key={`admin-${a.seq ?? "no-seq"}-${a.type}`} entry={a} txLinks={txLinks} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
