// Loading skeletons — the page's structure before the chain reads settle
// (reads take ~30–60s on first load). Skeletons beat spinners for
// perceived speed; each block mirrors the real layout it replaces.
import React from "react";

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-2xl px-4 py-3 shadow-card glass">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton mt-2 h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function GrantFileSkeleton() {
  return (
    <div className="glass mt-4 rounded-3xl p-4 shadow-card sm:p-6" aria-hidden="true">
      <div className="skeleton h-8 w-48" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="skeleton h-3 w-14" />
            <div className="skeleton mt-2 h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="skeleton mt-6 h-2.5 w-full" />
      <div className="mt-6 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-line p-4">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton mt-3 h-4 w-full" />
            <div className="skeleton mt-2 h-4 w-3/4" />
            <div className="skeleton mt-4 h-10 w-44 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingView() {
  return (
    <div role="status" aria-label="Loading grants from the chain">
      <StatsSkeleton />
      <GrantFileSkeleton />
      <p className="mt-4 text-center text-sm text-steel">
        Reading the protocol overview and every grant from GrantFlow on Bradbury…
      </p>
    </div>
  );
}
