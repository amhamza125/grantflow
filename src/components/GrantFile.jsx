import React, { useState } from "react";
import { explorerAddressUrl } from "../lib/config.js";
import { shortAddress, weiToGen } from "../lib/genlayer.js";

const STATUS_STYLE = {
  FUNDED: "bg-green-100 text-green-900",
  PENDING_FUNDING: "bg-amber-100 text-amber-900",
  CANCELLED: "bg-stone-200 text-stone-700",
  COMPLETE: "bg-emerald-100 text-emerald-900",
  OPEN: "bg-sky-100 text-sky-900",
  SUBMITTED: "bg-amber-100 text-amber-900",
  APPROVED: "bg-green-100 text-green-900",
  VERIFIED: "bg-emerald-100 text-emerald-900",
};

function Chip({ value }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[value] || "bg-stone-100"}`}>
      {value}
    </span>
  );
}

export default function GrantFile({
  grant,
  account,
  isOwner,
  busy,
  onFund,
  onSubmitEvidence,
  onAssess,
  onRelease,
  onCancel,
  onConnect,
}) {
  const [evSummary, setEvSummary] = useState("");
  const [evLinks, setEvLinks] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);

  const me = (account || "").toLowerCase();
  const isGrantor = me && me === String(grant.grantor || "").toLowerCase();
  const isBuilder = me && me === String(grant.builder || "").toLowerCase();
  const current = grant.milestones[Number(grant.current_milestone)] || null;
  const totalWei = BigInt(grant.total_escrow_wei);
  const releasedWei = BigInt(grant.released_wei);
  const unclaimedWei = totalWei - releasedWei;

  const submitEvidence = () => {
    const links = evLinks.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!evSummary.trim() || links.length === 0) return;
    onSubmitEvidence(grant, evSummary, links);
    setEvSummary("");
    setEvLinks("");
    setShowEvidence(false);
  };

  return (
    <article className="mt-6 rounded-lg border border-ink bg-paper shadow-file">
      {/* Grant header — the top of the file */}
      <header className="border-b border-rule px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <p className="font-mono text-xs text-inksoft">GRANT #{grant.id}</p>
            <h3 className="font-display text-2xl font-bold leading-tight">{grant.title}</h3>
          </div>
          <span className="ml-auto">
            <Chip value={grant.status} />
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-inksoft">Grantor</dt>
            <dd>
              <a className="font-mono underline" href={explorerAddressUrl(grant.grantor)} target="_blank" rel="noreferrer">
                {shortAddress(grant.grantor)}
              </a>
              {isGrantor && <span className="ml-1 text-xs font-semibold text-pine">(you)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-inksoft">Builder</dt>
            <dd>
              <a className="font-mono underline" href={explorerAddressUrl(grant.builder)} target="_blank" rel="noreferrer">
                {shortAddress(grant.builder)}
              </a>
              {isBuilder && <span className="ml-1 text-xs font-semibold text-pine">(you)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-inksoft">Total escrow</dt>
            <dd className="font-semibold">{weiToGen(totalWei)} GEN</dd>
          </div>
          <div>
            <dt className="text-xs text-inksoft">Released</dt>
            <dd className="font-semibold">{weiToGen(releasedWei)} GEN</dd>
          </div>
        </dl>
        {/* Grant-level actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {grant.status === "PENDING_FUNDING" && (
            <button
              onClick={() => (account ? onFund(grant) : onConnect())}
              disabled={!!busy[`fund-${grant.id}`]}
              className="rounded bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pinebright disabled:opacity-50"
            >
              {busy[`fund-${grant.id}`] ? "Funding…" : `Fund — ${weiToGen(totalWei)} GEN`}
            </button>
          )}
          {grant.status === "PENDING_FUNDING" && (
            <span className="self-center text-xs text-inksoft">
              Funding locks the exact total. A wrong amount or a funder who is not the grantor is refunded in full by the contract.
            </span>
          )}
          {(grant.status === "FUNDED" || grant.status === "PENDING_FUNDING") && (
            <button
              onClick={() => (account ? onCancel(grant) : onConnect())}
              disabled={!!busy[`cancel-${grant.id}`]}
              className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {busy[`cancel-${grant.id}`] ? "Cancelling…" : "Cancel grant — refund unclaimed escrow"}
            </button>
          )}
          {!account && (
            <span className="self-center text-xs text-inksoft">
              Connect your wallet to fund, submit evidence, assess, release or cancel.
            </span>
          )}
        </div>
      </header>

      {/* Milestones — the middle of the file */}
      <section className="px-4 py-4 sm:px-6">
        <h4 className="font-display text-lg font-bold">Milestones</h4>
        <ol className="mt-3 space-y-4">
          {grant.milestones.map((m, idx) => {
            const isCurrent = idx === Number(grant.current_milestone);
            const verdict = m.verdict;
            return (
              <li
                key={m.id}
                className={`rounded-lg border p-4 ${isCurrent ? "border-pine bg-green-50/50" : "border-rule bg-paper"}`}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-mono text-xs text-inksoft">MILESTONE {m.id}</span>
                  <Chip value={m.status} />
                  {isCurrent && <span className="text-xs font-semibold text-pine">· current</span>}
                  <span className="ml-auto font-semibold">{weiToGen(m.amount_wei)} GEN</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{m.spec}</p>
                {m.paid_wei && BigInt(m.paid_wei) > 0n && (
                  <p className="mt-1 text-sm font-semibold text-pine">Paid: {weiToGen(m.paid_wei)} GEN</p>
                )}

                {/* Evidence on file */}
                {m.evidence && (
                  <div className="mt-3 rounded border border-rule bg-paper2 p-3 text-sm">
                    <p className="font-semibold">Evidence on file</p>
                    <p className="mt-1">{m.evidence.summary}</p>
                    <ul className="mt-1 space-y-1">
                      {m.evidence.links.map((l, i) => (
                        <li key={i}>
                          <a href={l} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-pine underline">
                            {l}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.evidence_failures > 0 && (
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Evidence could not be fetched {m.evidence_failures} time(s)
                    {m.last_evidence_error ? ` — last error: ${m.last_evidence_error}` : ""}. No verdict was
                    recorded and no funds moved; the milestone stays open.
                  </p>
                )}

                {/* Verdict — with grounding receipt */}
                {verdict && (
                  <div
                    className={`mt-3 rounded border p-3 text-sm ${
                      verdict.met ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
                    }`}
                  >
                    <p className="font-display text-base font-bold">
                      Jury verdict: {verdict.met ? "MET" : "NOT_MET"}
                      {verdict.score !== null && verdict.score !== undefined ? ` · score ${verdict.score}` : " · score not recorded"}
                    </p>
                    {verdict.reasons && verdict.reasons.length > 0 && (
                      <ul className="mt-1 list-disc pl-5">
                        {verdict.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {verdict.grounding && (
                      <p className="mt-2 font-mono text-xs">
                        Grounding receipt — artifacts fetched: {verdict.grounding.artifacts_fetched} · primary
                        sha256: {verdict.grounding.primary_sha256}
                      </p>
                    )}
                  </div>
                )}

                {/* Milestone actions — only the current milestone, only the right party */}
                {isCurrent && grant.status === "FUNDED" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.status === "OPEN" && (
                      <button
                        onClick={() => (account ? setShowEvidence((s) => !s) : onConnect())}
                        className="rounded border border-pine bg-paper px-4 py-2 text-sm font-semibold text-pine hover:bg-green-50"
                      >
                        {showEvidence ? "Close evidence form" : "Submit evidence"}
                      </button>
                    )}
                    {m.status === "SUBMITTED" && (
                      <button
                        onClick={() => (account ? onAssess(grant) : onConnect())}
                        disabled={!!busy[`assess-${grant.id}`]}
                        className="rounded bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pinebright disabled:opacity-50"
                      >
                        {busy[`assess-${grant.id}`] ? "Jury assessing…" : "Assess milestone — run the AI jury"}
                      </button>
                    )}
                    {m.status === "APPROVED" && (
                      <button
                        onClick={() => (account ? onRelease(grant) : onConnect())}
                        disabled={!!busy[`release-${grant.id}`]}
                        className="rounded bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pinebright disabled:opacity-50"
                      >
                        {busy[`release-${grant.id}`] ? "Releasing…" : `Release tranche — ${weiToGen(m.amount_wei)} GEN to builder`}
                      </button>
                    )}
                    {m.status === "OPEN" && (
                      <span className="self-center text-xs text-inksoft">
                        {isBuilder
                          ? "You are the builder — submit evidence links for this milestone."
                          : "Only the builder can submit evidence for this milestone."}
                      </span>
                    )}
                    {m.status === "APPROVED" && (
                      <span className="self-center text-xs text-inksoft">
                        {isGrantor
                          ? "The jury said MET. You are the grantor — releasing pays the builder, and the payout is proven by the builder's balance change."
                          : "The jury said MET. Only the grantor can release the tranche."}
                      </span>
                    )}
                  </div>
                )}

                {/* Evidence form */}
                {showEvidence && isCurrent && m.status === "OPEN" && (
                  <div className="mt-3 rounded border border-rule bg-paper2 p-3">
                    <label className="block text-sm font-semibold">What was delivered (your summary)</label>
                    <textarea
                      value={evSummary}
                      onChange={(e) => setEvSummary(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm"
                      placeholder="One or two sentences on what you delivered for this milestone."
                    />
                    <label className="mt-3 block text-sm font-semibold">Evidence links — one per line</label>
                    <textarea
                      value={evLinks}
                      onChange={(e) => setEvLinks(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 font-mono text-sm"
                      placeholder="https://…"
                    />
                    <p className="mt-1 text-xs text-inksoft">
                      The contract fetches these links itself and the jury judges the fetched content — your
                      summary is only the claim, never the evidence.
                    </p>
                    <button
                      onClick={submitEvidence}
                      disabled={!!busy[`evidence-${grant.id}`] || !evSummary.trim() || !evLinks.trim()}
                      className="mt-2 rounded bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy[`evidence-${grant.id}`] ? "Submitting…" : "Submit evidence on chain"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </article>
  );
}
