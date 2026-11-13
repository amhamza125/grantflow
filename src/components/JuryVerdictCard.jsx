// Per-milestone jury verdict card — the real jury record, not a summary.
//
// Every number here comes from on-chain data: the milestone's verdict
// (get_milestone), the grounding receipt, the activity history, and the
// ASSESS tx payload from the explorer (validator count). There are NO
// per-judge votes anywhere — GenLayer consensus delivers ONE agreed verdict
// to the contract, and the stored record keeps score null with the fixed
// reason "no per-validator score is recorded". A v3.5 could not add
// individual votes either; the chain does not record them.
//
// Fields (brief §1):
//   * verdict + payout % (VerdictBadge)
//   * "Assessed N×" — assess_attempts, always shown
//   * "Evidence failed N×" — evidence_failures, always shown (0 included)
//   * validator count for THIS assessment — from the matched ASSESS tx's
//     `validators` list (3–5 on every real tx); the row is omitted until
//     the tx is matched, never guessed
//   * evidence_sha256 — the grounding hash the jury stored on chain
//   * grounding receipt expanded by default (defaultOpen)
//   * telemetry pill — attempts + failures in one line
//   * "Verify SHA-256" — the formula + the evidence links, so anyone can
//     re-derive the stored hash
//   * appeal delta strip — only when the milestone was appealed and there
//     are two ASSESS entries to compare
//   * explorer link to the ASSESS tx
import React, { useState } from "react";
import VerdictBadge from "./VerdictBadge.jsx";
import GroundingReceipt from "./GroundingReceipt.jsx";
import AssessProgressBar from "./AssessProgressBar.jsx";
import { txLinkFor, safeHref } from "../lib/txlinks.js";
import { explorerTxUrl } from "../lib/config.js";
import { shortAddress } from "../lib/genlayer.js";

function truncateMiddle(s, head = 12, tail = 10) {
  if (!s || s.length <= head + tail + 3) return s || "";
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// The ASSESS entry for this milestone, from the activity history. There is
// one ASSESS entry per successful assessment; JURY_FAILURE /
// EVIDENCE_FAILURE entries mark the failed attempts. Entries carry
// milestone_id (the contract's _log payload) — that is the match key.
function assessEntriesFor(activity, grantId, milestoneIndex) {
  return (activity || []).filter((e) => {
    if (Number(e.grant_id) !== Number(grantId)) return false;
    if (!["ASSESS", "JURY_FAILURE", "EVIDENCE_FAILURE"].includes(e.type)) return false;
    const mi = e.milestone_id !== undefined && e.milestone_id !== null
      ? Number(e.milestone_id)
      : null;
    if (mi === null) return false;
    return mi === Number(milestoneIndex);
  });
}

export default function JuryVerdictCard({
  grant,
  milestone,
  milestoneIndex,
  activity,
  txLinks,
  assessProgress,
}) {
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const verdict = milestone?.verdict || null;
  const grounding = verdict?.grounding || null;
  const attempts = Number(milestone?.assess_attempts || 0);
  const failures = Number(milestone?.evidence_failures || 0);
  const appealed = !!verdict?.appealed;

  const entries = assessEntriesFor(activity, grant.id, milestoneIndex);
  // The latest successful ASSESS entry is the verdict's own tx.
  const assessEntry = [...entries].reverse().find((e) => e.type === "ASSESS") || null;
  const assessLink = assessEntry ? txLinkFor(assessEntry, txLinks) : null;
  const validatorCount = assessLink?.validators?.length || 0;
  // Appeal delta: first vs last ASSESS entry (only when appealed).
  const assessOnly = entries.filter((e) => e.type === "ASSESS");
  const firstAssess = assessOnly.length >= 2 ? assessOnly[0] : null;
  const lastAssess = assessOnly.length >= 2 ? assessOnly[assessOnly.length - 1] : null;

  const evidenceHash = grounding?.evidence_sha256 || verdict?.evidence_sha256 || null;
  const fetched = grounding?.artifacts_fetched;
  const unavailable = grounding?.artifacts_unavailable;
  const links = Array.isArray(milestone?.evidence?.links) ? milestone.evidence.links : [];
  const payoutPct =
    verdict?.payout_pct !== undefined && verdict?.payout_pct !== null
      ? Number(verdict.payout_pct)
      : null;

  const progressForThisGrant =
    assessProgress && Number(assessProgress.grantId) === Number(grant.id) ? assessProgress : null;

  const copyHash = async () => {
    if (!evidenceHash) return;
    try {
      await navigator.clipboard.writeText(evidenceHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the hash is still visible to copy by hand.
    }
  };

  const telemetry = verdict
    ? `Consensus reached on attempt #${Math.max(1, attempts)} · ${failures} evidence fetch failure${failures === 1 ? "" : "s"}`
    : attempts > 0
      ? `${attempts} failed consensus attempt${attempts === 1 ? "" : "s"} — the milestone awaits expiry`
      : "No assessment yet";

  return (
    <div
      id={`verdict-${milestoneIndex}`}
      className="mt-3 rounded-2xl border border-line bg-panelStrong px-3 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-display text-base font-bold">
          Jury verdict — Milestone {Number(milestoneIndex) + 1}
        </h4>
        <span className="rounded-full bg-panelStrong px-2 py-0.5 text-[11px] font-bold text-steel ring-1 ring-inset ring-line">
          Assessed {attempts}×
        </span>
        {verdict && <VerdictBadge verdict={verdict} />}
      </div>

      {/* Telemetry pill — always visible, even at 0 attempts. */}
      <p className="mt-2 inline-block rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-steel ring-1 ring-inset ring-line">
        {telemetry}
      </p>

      {verdict ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-steel">Payout</dt>
            <dd className="font-bold">
              {payoutPct !== null ? `${payoutPct}% of this milestone` : "—"}
              {payoutPct !== null && payoutPct < 100
                ? ` · the rest returns to the grantor`
                : ""}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-steel">Evidence the jury read</dt>
            <dd className="font-semibold">
              {fetched !== undefined && fetched !== null
                ? `${fetched} file${fetched === 1 ? "" : "s"} fetched`
                : "not recorded"}
              {unavailable !== undefined && unavailable !== null
                ? ` · ${unavailable} unavailable`
                : ""}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-steel">Evidence failed</dt>
            <dd className="font-semibold">{failures}×</dd>
          </div>
          {validatorCount > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-steel">Validators on this assessment</dt>
              <dd className="font-semibold">
                {validatorCount} validators · strict_eq consensus
              </dd>
            </div>
          )}
          {evidenceHash && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-steel">Evidence hash</dt>
              <dd className="font-mono text-xs font-semibold" title={evidenceHash}>
                {truncateMiddle(evidenceHash)}
                <button
                  onClick={copyHash}
                  className="ml-2 font-sans text-xs font-bold text-acid hover:underline"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-steel">
          No verdict yet for this milestone.
          {attempts > 0
            ? " The jury tried and could not reach consensus — the milestone stays open until its deadline, then anyone can expire it."
            : " Submit evidence and a party can ask the jury to assess it."}
        </p>
      )}

      {/* Verdict reasons — the jury's own words, from the contract. */}
      {verdict?.reasons && verdict.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {verdict.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="shrink-0 text-acid" aria-hidden="true">▸</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Appeal delta strip — only when appealed and two assessments exist. */}
      {appealed && firstAssess && lastAssess && (
        <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
          <p className="font-bold">Appeal changed the verdict</p>
          <p className="mt-1 leading-relaxed">
            Initial jury:{" "}
            <strong>
              {firstAssess.verdict || "—"}
              {firstAssess.payout_pct !== undefined && firstAssess.payout_pct !== null
                ? ` (${firstAssess.payout_pct}%)`
                : ""}
            </strong>
            {" → "}Appeal jury:{" "}
            <strong>
              {lastAssess.verdict || "—"}
              {lastAssess.payout_pct !== undefined && lastAssess.payout_pct !== null
                ? ` (${lastAssess.payout_pct}%)`
                : ""}
            </strong>
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
            {txLinkFor(firstAssess, txLinks).hash && (
              <a
                className="text-acid hover:underline"
                href={explorerTxUrl(txLinkFor(firstAssess, txLinks).hash)}
                target="_blank"
                rel="noreferrer"
              >
                First assessment ↗
              </a>
            )}
            {txLinkFor(lastAssess, txLinks).hash && (
              <a
                className="text-acid hover:underline"
                href={explorerTxUrl(txLinkFor(lastAssess, txLinks).hash)}
                target="_blank"
                rel="noreferrer"
              >
                Appeal assessment ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Verify SHA-256 — the formula + the evidence, so anyone can re-derive it. */}
      {evidenceHash && (
        <div className="mt-3">
          <button
            onClick={() => setVerifyOpen((o) => !o)}
            aria-expanded={verifyOpen}
            className="rounded-full bg-panel px-3 py-1.5 text-xs font-bold text-acid ring-1 ring-inset ring-line hover:underline"
          >
            {verifyOpen ? "▾ Hide SHA-256 check" : "Verify SHA-256"}
          </button>
          {verifyOpen && (
            <div className="mt-2 rounded-xl border border-line bg-panel px-3 py-3 text-sm">
              <p className="leading-relaxed text-steel">
                The hash below is what the jury stored on chain. It was built
                by hashing the fetched evidence excerpts, joined in link order:
              </p>
              <p className="mt-2 overflow-x-auto rounded-lg bg-panelStrong px-2 py-2 font-mono text-xs leading-relaxed">
                sha256(cleaned_excerpt_1 + &quot;\n§\n&quot; + cleaned_excerpt_2 + …)
              </p>
              <p className="mt-2 leading-relaxed">
                Stored hash:{" "}
                <span className="break-all font-mono text-xs font-semibold">{evidenceHash}</span>
              </p>
              {links.length > 0 && (
                <div className="mt-2">
                  <p className="font-bold">Evidence the jury fetched:</p>
                  <ul className="mt-1 space-y-1">
                    {links.map((u, i) => {
                      const safe = safeHref(u);
                      return (
                        <li key={i} className="break-all text-xs">
                          <span className="text-steel">{i + 1}. </span>
                          {safe ? (
                            <a className="font-semibold text-acid hover:underline" href={safe} target="_blank" rel="noreferrer">
                              {u}
                            </a>
                          ) : (
                            <span className="text-steel">{u} (not a web link)</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grounding receipt — expanded by default (the receipt is the proof). */}
      {grounding && <GroundingReceipt verdict={verdict} defaultOpen />}

      {/* Explorer link to this assessment's tx. */}
      {assessLink?.hash && (
        <p className="mt-3 text-sm">
          <a
            className="font-semibold text-acid hover:underline"
            href={explorerTxUrl(assessLink.hash)}
            target="_blank"
            rel="noreferrer"
            title={
              assessLink.exact
                ? "Open this assessment transaction on the Bradbury explorer"
                : "Matched by order — this is the most likely transaction for this assessment, not a proven exact match"
            }
          >
            {assessLink.exact ? "View assessment on Explorer" : "Likely assessment transaction"} ↗
          </a>
          {validatorCount > 0 && (
            <span className="text-steel"> · {validatorCount} validators</span>
          )}
        </p>
      )}

      {/* Live progress bar — only while an assess is in flight for this grant. */}
      {progressForThisGrant?.active && <AssessProgressBar progress={progressForThisGrant} />}
      {progressForThisGrant && !progressForThisGrant.active && progressForThisGrant.failed && (
        <AssessProgressBar progress={progressForThisGrant} />
      )}
    </div>
  );
}
