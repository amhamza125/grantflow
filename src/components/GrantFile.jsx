// Grant file — one grant, its milestones, verdicts and actions.
// Reads only from the grant object passed in (all on-chain reads happen in
// App.jsx); the buttons here call handlers that submit real transactions
// or prompt the wallet connect.
//
// Claim-flow facts the file relies on: a release credits the amount as
// claimable ("Credited … withdraw to receive it"); a PARTIAL verdict is
// recorded on the milestone and release_tranche credits both shares — the
// builder's percentage and the grantor's remainder — atomically. Cancel is
// refused while an awarded tranche is unpaid (APPROVED / PARTIAL).
// expire_milestone takes OPEN / SUBMITTED / REJECTED_FINAL only — an
// awarded verdict is not expirable.
import React, { useState } from "react";
import { explorerAddressUrl } from "../lib/config.js";
import { shortAddress, weiToGen } from "../lib/genlayer.js";
import { deadlineDate } from "../lib/time.js";
import DeadlineChip from "./DeadlineChip.jsx";
import GrantProgress from "./GrantProgress.jsx";
import GroundingReceipt from "./GroundingReceipt.jsx";
import VerdictSeal from "./VerdictSeal.jsx";
import { builderRibbonText, grantorRibbonText } from "../lib/reputation.js";

const STATUS_STYLE = {
  FUNDED: "bg-mint/15 text-mint",
  PENDING_FUNDING: "bg-gold/15 text-gold",
  CANCELLED: "bg-panelStrong text-steel",
  COMPLETE: "bg-mint/15 text-mint",
  OPEN: "bg-cyan/15 text-cyan",
  SUBMITTED: "bg-gold/15 text-gold",
  APPROVED: "bg-mint/15 text-mint",
  PARTIAL: "bg-gold/15 text-gold",
  VERIFIED: "bg-mint/15 text-mint",
  EXPIRED: "bg-panelStrong text-steel",
  REJECTED_FINAL: "bg-rose/15 text-rose",
};

function deadlineText(m) {
  const d = Number(m.deadline || 0);
  if (!d) return "No deadline";
  const passed = Date.now() / 1000 >= d;
  return `Deadline ${deadlineDate(d)}${passed ? " — passed" : ""}`;
}

function verdictLabel(v) {
  if (!v) return "";
  return v.verdict || (v.met ? "MET" : "NOT_MET");
}

function Chip({ value }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-line ${STATUS_STYLE[value] || "bg-panel"}`}>
      {value}
    </span>
  );
}

export default function GrantFile({
  grant,
  account,
  isOwner,
  busy,
  reputation,
  onFund,
  onSubmitEvidence,
  onAssess,
  onRelease,
  onAppeal,
  onExpire,
  onCancel,
  onConnect,
}) {
  const [evSummary, setEvSummary] = useState("");
  const [evLinks, setEvLinks] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [copied, setCopied] = useState(false);

  const me = (account || "").toLowerCase();
  const isGrantor = me && me === String(grant.grantor || "").toLowerCase();
  const isBuilder = me && me === String(grant.builder || "").toLowerCase();
  const current = grant.milestones[Number(grant.current_milestone)] || null;
  const totalWei = BigInt(grant.total_escrow_wei);
  const releasedWei = BigInt(grant.released_wei);
  const refundedWei = BigInt(grant.refunded_wei || "0");
  const unclaimedWei = totalWei - releasedWei - refundedWei;
  // The contract refuses to cancel while an awarded tranche is unpaid.
  const cancelBlocked =
    current && ["APPROVED", "PARTIAL"].includes(current.status);
  // expire_milestone only takes OPEN / SUBMITTED (after the grace) /
  // REJECTED_FINAL — an awarded verdict (APPROVED, PARTIAL) is not expirable.
  const expirable = (m) =>
    m && ["OPEN", "SUBMITTED", "REJECTED_FINAL"].includes(m.status);
  const deadlinePassed = (m) => m && Number(m.deadline || 0) > 0 && Date.now() / 1000 >= Number(m.deadline);

  // On-ledger reputation ribbons, computed only from the grants loaded.
  const builderRibbon = reputation ? builderRibbonText(reputation.byBuilder[String(grant.builder || "").toLowerCase()]) : "";
  const grantorRibbon = reputation ? grantorRibbonText(reputation.byGrantor[String(grant.grantor || "").toLowerCase()]) : "";

  const grantUrl =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}#grant-${grant.id}` : "";
  const copyGrantLink = async () => {
    try {
      await navigator.clipboard.writeText(grantUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link stays visible in the address bar.
    }
  };

  const submitEvidence = () => {
    const links = evLinks.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!evSummary.trim() || links.length === 0) return;
    onSubmitEvidence(grant, evSummary, links);
    setEvSummary("");
    setEvLinks("");
    setShowEvidence(false);
  };

  return (
    <article className="mt-6 rounded-3xl glass shadow-card">
      {/* Grant header — the top of the file */}
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <p className="font-mono text-xs text-steel">GRANT #{grant.id}</p>
            <h3 className="font-display text-2xl font-bold leading-tight">{grant.title}</h3>
          </div>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={copyGrantLink}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-acid/60"
              aria-label={`Copy link to grant ${grant.id}`}
              title="Copy a link to this grant"
            >
              {copied ? "✓ Copied" : "⧉ Copy link"}
            </button>
            <Chip value={grant.status} />
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs text-steel">Grantor</dt>
            <dd>
              <a className="font-mono underline" href={explorerAddressUrl(grant.grantor)} target="_blank" rel="noreferrer">
                {shortAddress(grant.grantor)}
              </a>
              {isGrantor && <span className="ml-1 text-xs font-semibold text-acid">(you)</span>}
            </dd>
            {grantorRibbon && <dd className="mt-0.5 text-xs text-steel">{grantorRibbon}</dd>}
          </div>
          <div>
            <dt className="text-xs text-steel">Builder</dt>
            <dd>
              <a className="font-mono underline" href={explorerAddressUrl(grant.builder)} target="_blank" rel="noreferrer">
                {shortAddress(grant.builder)}
              </a>
              {isBuilder && <span className="ml-1 text-xs font-semibold text-acid">(you)</span>}
            </dd>
            {builderRibbon && <dd className="mt-0.5 text-xs text-steel">{builderRibbon}</dd>}
          </div>
          <div>
            <dt className="text-xs text-steel">Total escrow</dt>
            <dd className="font-semibold">{weiToGen(totalWei)} GEN</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Released</dt>
            <dd className="font-semibold">{weiToGen(releasedWei)} GEN</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Refunded</dt>
            <dd className="font-semibold">{weiToGen(refundedWei)} GEN</dd>
          </div>
        </dl>
        <GrantProgress milestones={grant.milestones} amountWei={grant.total_escrow_wei} />
        {/* Grant-level actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {grant.status === "PENDING_FUNDING" && (
            <button
              onClick={() => (account ? onFund(grant) : onConnect())}
              disabled={!!busy[`fund-${grant.id}`]}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              {busy[`fund-${grant.id}`] ? "Funding…" : `Fund — ${weiToGen(totalWei)} GEN`}
            </button>
          )}
          {grant.status === "PENDING_FUNDING" && (
            <span className="self-center text-xs text-steel">
              Funding locks the exact total. A wrong amount or a funder who is not the grantor is refunded in full by the contract.
            </span>
          )}
          {(grant.status === "FUNDED" || grant.status === "PENDING_FUNDING") && !cancelBlocked && (
            <button
              onClick={() => (account ? onCancel(grant) : onConnect())}
              disabled={!!busy[`cancel-${grant.id}`]}
              className="rounded-full border border-rose/40 bg-rose/10 px-4 py-2.5 text-sm font-semibold text-rose transition hover:bg-rose/15 active:scale-[0.98] disabled:opacity-50"
            >
              {busy[`cancel-${grant.id}`] ? "Cancelling…" : "Cancel grant — refund unclaimed escrow"}
            </button>
          )}
          {grant.status === "FUNDED" && cancelBlocked && (
            <span className="self-center text-xs text-steel">
              Cancelling is paused while the jury-awarded tranche is unpaid — release it first.
            </span>
          )}
          {!account && (
            <span className="self-center text-xs text-steel">
              Connect your wallet to fund, submit evidence, assess, release or cancel.
            </span>
          )}
        </div>
      </header>

      {/* Milestones — the middle of the file */}
      <section className="px-4 py-4 sm:px-6">
        <h4 className="font-display text-lg font-bold">Milestones</h4>
        <ol className="milestone-river mt-3 grid gap-4">
          {grant.milestones.map((m, idx) => {
            const isCurrent = idx === Number(grant.current_milestone);
            const verdict = m.verdict;
            const riverClass = isCurrent ? "river-current" : idx < Number(grant.current_milestone) ? "river-past" : "";
            // The fill keys off the verdict's payout_pct, not the milestone
            // status: a settled PARTIAL reads VERIFIED on chain with verdict
            // PARTIAL, so the fill still renders at payout_pct% height.
            const partialPct =
              verdict && verdictLabel(verdict) === "PARTIAL" && typeof verdict.payout_pct === "number"
                ? verdict.payout_pct
                : null;
            return (
              <li
                key={m.id}
                className={`milestone-card rounded-2xl border p-4 sm:p-5 ${isCurrent ? "border-acid/50 bg-mint/10 shadow-glow" : "border-line bg-panel"} ${riverClass}`}
              >
                {partialPct !== null && (
                  <div className="liquid-fill" style={{ height: `${partialPct}%` }} aria-hidden="true" />
                )}
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-mono text-xs text-steel">MILESTONE {m.id}</span>
                  <Chip value={m.status} />
                  {isCurrent && <span className="text-xs font-semibold text-acid">· current</span>}
                  <span className="ml-auto font-semibold">{weiToGen(m.amount_wei)} GEN</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{m.spec}</p>
                <p className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${deadlinePassed(m) && expirable(m) ? "font-semibold text-gold" : "text-steel"}`}>
                  <DeadlineChip deadline={m.deadline} />
                  <span>{deadlineText(m)}</span>
                </p>
                {m.paid_wei && BigInt(m.paid_wei) > 0n && (
                  <p className="mt-1 text-sm font-semibold text-acid">
                    Credited: {weiToGen(m.paid_wei)} GEN
                    {verdict && verdict.verdict === "PARTIAL" ? ` (${verdict.payout_pct}% of ${weiToGen(m.amount_wei)} GEN)` : ""}
                    {" "}— withdraw to receive it.
                  </p>
                )}
                {m.refunded_wei && BigInt(m.refunded_wei) > 0n && (
                  <p className="mt-1 text-sm font-semibold text-steel">
                    Refunded to grantor: {weiToGen(m.refunded_wei)} GEN
                  </p>
                )}

                {/* Evidence on file */}
                {m.evidence && (
                  <div className="mt-3 rounded-2xl border border-line bg-panelInset p-3 text-sm sm:p-4">
                    <p className="font-semibold">Evidence on file</p>
                    <p className="mt-1">{m.evidence.summary}</p>
                    <ul className="mt-1 space-y-1">
                      {m.evidence.links.map((l, i) => (
                        <li key={i}>
                          <a href={l} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-acid underline">
                            {l}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.evidence_failures > 0 && (
                  <p className="mt-2 text-sm font-semibold text-gold">
                    Evidence could not be fetched {m.evidence_failures} time(s)
                    {m.last_evidence_error ? ` — last error: ${m.last_evidence_error}` : ""}. No verdict was
                    recorded and no funds moved; the milestone stays open.
                  </p>
                )}

                {/* Verdict — seal + grounding receipt slip */}
                {verdict && (
                  <div
                    className={`mt-3 rounded-2xl border p-3 text-sm sm:p-4 ${
                      verdictLabel(verdict) === "MET"
                        ? "border-mint/40 bg-mint/10"
                        : verdictLabel(verdict) === "PARTIAL"
                          ? "border-gold/40 bg-gold/10"
                          : "border-rose/40 bg-rose/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <VerdictSeal verdict={verdictLabel(verdict)} sealKey={`${grant.id}-${m.id}-${verdictLabel(verdict)}`} />
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold">
                          Jury verdict: {verdictLabel(verdict)}
                          {verdictLabel(verdict) === "PARTIAL" ? ` · pays ${verdict.payout_pct}%` : ""}
                          {verdict.score !== null && verdict.score !== undefined ? ` · score ${verdict.score}` : " · score not recorded"}
                          {verdict.appealed ? " · decided on appeal (final)" : ""}
                        </p>
                        <p className="mt-1 text-xs text-steel">
                          The verdict stands on the fetched artifacts — the builder&apos;s summary is only the
                          claim, never the evidence.
                        </p>
                      </div>
                    </div>
                    <GroundingReceipt verdict={verdict} />
                  </div>
                )}

                {/* Milestone actions — only the current milestone, only the right party */}
                {isCurrent && grant.status === "FUNDED" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.status === "OPEN" && (
                      <button
                        onClick={() => (account ? setShowEvidence((s) => !s) : onConnect())}
                        className="rounded-full border border-acid/50 bg-mint/10 px-4 py-2.5 text-sm font-semibold text-acid transition hover:bg-mint/15 active:scale-[0.98]"
                      >
                        {showEvidence ? "Close evidence form" : "Submit evidence"}
                      </button>
                    )}
                    {m.status === "SUBMITTED" && (
                      <button
                        onClick={() => (account ? onAssess(grant) : onConnect())}
                        disabled={!!busy[`assess-${grant.id}`]}
                        className="btn-primary px-4 py-2.5 text-sm"
                      >
                        {busy[`assess-${grant.id}`] ? "Jury assessing…" : "Assess milestone — run the AI jury"}
                      </button>
                    )}
                    {m.status === "APPROVED" && (
                      <button
                        onClick={() => (account ? onRelease(grant) : onConnect())}
                        disabled={!!busy[`release-${grant.id}`]}
                        className="btn-primary px-4 py-2.5 text-sm"
                      >
                        {busy[`release-${grant.id}`] ? "Releasing…" : `Release tranche — ${weiToGen(m.amount_wei)} GEN to builder`}
                      </button>
                    )}
                    {m.status === "PARTIAL" && (
                      <button
                        onClick={() => (account ? onRelease(grant) : onConnect())}
                        disabled={!!busy[`release-${grant.id}`]}
                        className="btn-primary px-4 py-2.5 text-sm"
                      >
                        {busy[`release-${grant.id}`]
                          ? "Releasing…"
                          : `Release partial tranche — ${verdict ? verdict.payout_pct : ""}% of ${weiToGen(m.amount_wei)} GEN to builder`}
                      </button>
                    )}
                    {verdict && verdictLabel(verdict) === "NOT_MET" && !m.verdict_final && isBuilder && (
                      <button
                        onClick={() => (account ? onAppeal(grant) : onConnect())}
                        disabled={!!busy[`appeal-${grant.id}`]}
                        className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/15 active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy[`appeal-${grant.id}`] ? "Requesting…" : "Request the one appeal"}
                      </button>
                    )}
                    {verdict && verdictLabel(verdict) === "NOT_MET" && !m.verdict_final && !isBuilder && (
                      <span className="self-center text-xs text-steel">
                        The jury said NOT_MET. Only the builder can request the one appeal — after that, the
                        second verdict is final.
                      </span>
                    )}
                    {expirable(m) && deadlinePassed(m) && (
                      <button
                        onClick={() => (account ? onExpire(grant) : onConnect())}
                        disabled={!!busy[`expire-${grant.id}`]}
                        className="btn-ghost px-4 py-2.5 text-sm"
                      >
                        {busy[`expire-${grant.id}`]
                          ? "Expiring…"
                          : `Expire milestone — refund ${weiToGen(BigInt(m.amount_wei) - BigInt(m.paid_wei))} GEN to grantor`}
                      </button>
                    )}
                    {m.status === "OPEN" && (
                      <span className="self-center text-xs text-steel">
                        {isBuilder
                          ? "You are the builder — submit evidence links for this milestone."
                          : "Only the builder can submit evidence for this milestone."}
                      </span>
                    )}
                    {m.status === "APPROVED" && (
                      <span className="self-center text-xs text-steel">
                        {isGrantor
                          ? "The jury said MET. You are the grantor — releasing pays the builder."
                          : "The jury said MET. Only the grantor can release the tranche."}
                      </span>
                    )}
                    {m.status === "PARTIAL" && (
                      <span className="self-center text-xs text-steel">
                        The jury said PARTIAL — releasing pays {verdict ? verdict.payout_pct : ""}% to the
                        builder and credits the rest to the grantor at the same time.
                      </span>
                    )}
                  </div>
                )}

                {/* Evidence form */}
                {showEvidence && isCurrent && m.status === "OPEN" && (
                  <div className="mt-3 rounded-2xl border border-line bg-panelInset p-3 sm:p-4">
                    <label className="block text-sm font-semibold">What was delivered (your summary)</label>
                    <textarea
                      value={evSummary}
                      onChange={(e) => setEvSummary(e.target.value)}
                      rows={2}
                      className="glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm"
                      placeholder="One or two sentences on what you delivered for this milestone."
                    />
                    <label className="mt-3 block text-sm font-semibold">Evidence links — one per line</label>
                    <textarea
                      value={evLinks}
                      onChange={(e) => setEvLinks(e.target.value)}
                      rows={2}
                      className="glass-input mt-1 w-full rounded-xl px-3 py-2.5 font-mono text-sm"
                      placeholder="https://…"
                    />
                    <p className="mt-1 text-xs text-steel">
                      The contract fetches these links itself and the jury judges the fetched content — your
                      summary is only the claim, never the evidence.
                    </p>
                    <button
                      onClick={submitEvidence}
                      disabled={!!busy[`evidence-${grant.id}`] || !evSummary.trim() || !evLinks.trim()}
                      className="btn-primary mt-2 px-4 py-2.5 text-sm"
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
