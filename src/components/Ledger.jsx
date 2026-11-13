// Public Ledger — the whole contract's activity, newest first, in the
// same visual language as the grant file's Activity section (one shared
// ActivityTimeline, not two designs).
//
// Wallet entries (WITHDRAW / CONFIRM / RESTORE) INCLUDED here — this is
// their home alongside My Funds. Admin entries (PAUSE / RESUME / SWEEP /
// TRANSFER_OWNERSHIP) sit behind the collapsed "Protocol events" toggle.
import React from "react";
import { useApp } from "../lib/store.jsx";
import ActivityTimeline from "./ActivityTimeline.jsx";

export default function Ledger() {
  const { activity, activityLoading, txLinks, totalCount } = useApp();
  return (
    <section aria-label="Public ledger">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">Public Ledger</h2>
      <p className="mt-1 text-sm text-steel">
        Everything the contract has recorded, newest first — grants, verdicts, releases, withdrawals
        and refunds. Amounts are GEN credited to a claim — withdraw to receive them.
        {totalCount > 0 && (
          <>
            {" "}
            {totalCount} {totalCount === 1 ? "grant" : "grants"} on chain.
          </>
        )}
      </p>
      <div className="mt-4">
        <ActivityTimeline
          entries={activity}
          txLinks={txLinks}
          showAdminToggle
          title="Activity"
          loading={activityLoading}
          filterable
          pageSize={10}
        />
      </div>
    </section>
  );
}
