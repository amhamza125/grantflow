// GrantDetail — the grant file. Replaces GrantFile.
// Reads store.selected (no props). Every control is wired to a store
// handler or a real link; a button that cannot act is disabled WITH a short
// reason shown, never a dead click. The enable/disable rules are the old
// GrantFile's: assess only by a party when evidence exists; release only
// after a MET/PARTIAL verdict; appeal once after NOT_MET; expire only after
// the deadline; cancel only by the grantor while open; fund only while
// PENDING_FUNDING and only by the grantor.
//
// Activity here is THIS grant only (filterForGrant) — WITHDRAW / CONFIRM /
// RESTORE carry no grant_id and never appear inside a grant file; they live
// in My Funds / the Ledger only.
import React, { useEffect, useState } from "react";
import { useApp } from "../lib/store.jsx";
import { explorerAddressUrl } from "../lib/config.js";
import { shortAddress, weiToGen } from "../lib/genlayer.js";
import { deadlineDate } from "../lib/time.js";
import { filterForGrant } from "../lib/activity.js";
import { safeHref } from "../lib/txlinks.js";
import { builderRibbonText, grantorRibbonText } from "../lib/reputation.js";
import GrantProgress from "./GrantProgress.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import ActivityTimeline from "./ActivityTimeline.jsx";
import DeadlineChip from "./DeadlineChip.jsx";
import JuryVerdictCard from "./JuryVerdictCard.jsx";

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

function Chip({ value }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-line ${STATUS_STYLE[value] || "bg-panel"}`}
    >
      {value}
    </span>
  );
}

function safeBig(v) {
  try {
    return BigInt(v || "0");
  } catch {
    return 0n;
  }
}

function verdictLabel(v) {
  if (!v) return "";
  return v.verdict || (v.met ? "MET" : "NOT_MET");
}

function deadlineText(m) {
  const d = Number(m.deadline || 0);
  if (!d) return "No deadline";
  const passed = Date.now() / 1000 >= d;
  return `Deadline ${deadlineDate(d)}${passed ? " — passed" : ""}`;
}

export default function GrantDetail() {
  const {
    selected: grant,
    account,
    isPaused,
    busy,
    reputation,
    evidenceTs,
    activity,
    activityLoading,
    txLinks,
    openChooser,
    onFund,
    onSubmitEvidence,
    onAssess,
    onRelease,
    onAppeal,
    onExpire,
    onCancel,
    CONTRACT_ADDRESS,
    explorerAddressUrl: explorerAddr,
    filterBuilder,
    assessProgress,
    isCustomContract,
    setView,
    selectGrant,
    evidenceRequest,
    clearEvidenceRequest,
  } = useApp();

  const [evSummary, setEvSummary] = useState("");
  const [evLinks, setEvLinks] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [copied, setCopied] = useState(false);
  // Two-tap fund confirmation on a custom contract (guard 3): the first
  // tap shows the warning, the second actually funds.
  const [confirmFund, setConfirmFund] = useState(false);
  // "More actions ▾" menu + the collapsed Activity section (UX round).
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  // Cancel is two-step: the menu item opens an inline confirmation panel.
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // A fund confirmation belongs to one grant — never carry it to the next.
  useEffect(() => {
    setConfirmFund(false);
    setMenuOpen(false);
    setActivityOpen(false);
    setCancelConfirm(false);
  }, [grant?.id]);

  // "Your turn" evidence request: a card in the feed asked for this
  // grant's evidence form — open it and scroll to the milestone.
  useEffect(() => {
    if (evidenceRequest && grant && Number(evidenceRequest.grantId) === Number(grant.id)) {
      setShowEvidence(true);
      clearEvidenceRequest();
      requestAnimationFrame(() => {
        document
          .getElementById(`milestone-${Number(grant.current_milestone)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [evidenceRequest, grant?.id]);

  if (!grant) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-line p-8 text-center text-sm text-steel">
        Select a grant to open its file.
      </div>
    );
  }

  const me = (account || "").toLowerCase();
  const isGrantor = !!me && me === String(grant.grantor || "").toLowerCase();
  const isBuilder = !!me && me === String(grant.builder || "").toLowerCase();
  const isParty = isGrantor || isBuilder;
  const current = grant.milestones[Number(grant.current_milestone)] || null;
  const totalWei = safeBig(grant.total_escrow_wei);
  const releasedWei = safeBig(grant.released_wei);
  const refundedWei = safeBig(grant.refunded_wei);
  const unclaimedWei = totalWei - releasedWei - refundedWei;

  // The contract refuses to cancel while an awarded tranche is unpaid,
  // while the jury holds the milestone (SUBMITTED), and while the
  // builder's appeal is open — mirror all three, each with its reason.
  const cancelBlocked =
    current &&
    (["APPROVED", "PARTIAL", "SUBMITTED"].includes(current.status) || !!current.appeal_pending);
  // expire_milestone only takes OPEN / SUBMITTED / REJECTED_FINAL — an
  // awarded verdict (APPROVED, PARTIAL) is not expirable.
  const expirable = (m) => m && ["OPEN", "SUBMITTED", "REJECTED_FINAL"].includes(m.status);
  const deadlinePassed = (m) =>
    m && Number(m.deadline || 0) > 0 && Date.now() / 1000 >= Number(m.deadline);

  const builderRecord = reputation
    ? reputation.byBuilder[String(grant.builder || "").toLowerCase()]
    : null;
  const builderRibbon = reputation ? builderRibbonText(builderRecord) : "";
  const grantorRibbon = reputation
    ? grantorRibbonText(reputation.byGrantor[String(grant.grantor || "").toLowerCase()])
    : "";

  const grantUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#grant-${grant.id}`
      : "";
  const copyGrantLink = async () => {
    try {
      await navigator.clipboard.writeText(grantUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link stays visible in the address bar.
    }
  };

  const evidenceLinks = evLinks.split("\n").map((l) => l.trim()).filter(Boolean);
  const tooManyLinks = evidenceLinks.length > 10;
  const submitEvidence = () => {
    const links = evidenceLinks;
    if (!evSummary.trim() || links.length === 0) return;
    if (links.length > 10) return; // contract rejects >10 (TOO_MANY_LINKS_MAX_10)
    onSubmitEvidence(grant, evSummary, links);
    setEvSummary("");
    setEvLinks("");
    setShowEvidence(false);
  };

  const grantActivity = filterForGrant(activity, grant.id);
  const evidenceSubmittedAt = current
    ? evidenceTs[`${grant.id}-${Number(grant.current_milestone)}`] || null
    : null;

  // --- The single action block (UX round) --------------------------------
  // One primary CTA + a "More actions ▾" menu. The enable/disable rules
  // are the old GrantFile's, unchanged: assess only by a party when
  // evidence exists; release only after a MET/PARTIAL verdict; appeal
  // once after NOT_MET; expire only after the deadline; cancel only by
  // the grantor while open; fund only while PENDING_FUNDING and only by
  // the grantor. Cancel is never the primary action. The block is hidden
  // entirely on settled grants (COMPLETE / CANCELLED / EXPIRED).
  const settled = ["COMPLETE", "CANCELLED", "EXPIRED"].includes(String(grant.status));
  const mVerdict = current?.verdict || null;
  const mVerdictName = verdictLabel(mVerdict);
  const canFund = grant.status === "PENDING_FUNDING" && !!account && isGrantor;
  const canEvidence = grant.status === "FUNDED" && current?.status === "OPEN" && !!account && isBuilder;
  const canAssess = grant.status === "FUNDED" && current?.status === "SUBMITTED" && !!account && isParty;
  const canRelease =
    grant.status === "FUNDED" &&
    ["APPROVED", "PARTIAL"].includes(current?.status) &&
    !!account &&
    isGrantor &&
    !isPaused;
  const canAppeal =
    grant.status === "FUNDED" &&
    !!mVerdict &&
    mVerdictName === "NOT_MET" &&
    !current.verdict_final &&
    !!account &&
    isBuilder;
  const canExpire = grant.status === "FUNDED" && expirable(current) && deadlinePassed(current) && !!account;
  const canCancel =
    (grant.status === "PENDING_FUNDING" || grant.status === "FUNDED") &&
    !cancelBlocked &&
    !!account &&
    isGrantor;

  const fundAction = () => {
    if (isCustomContract && !confirmFund) {
      setConfirmFund(true);
      return;
    }
    setConfirmFund(false);
    onFund(grant);
  };

  // Every action the grant can take, in primary-priority order. `enabled`
  // is the contract rule; `reason` is the exact text shown when it is not.
  const actionDefs = [
    {
      key: "fund",
      label:
        isCustomContract && confirmFund
          ? `Confirm funding — ${weiToGen(totalWei)} GEN to custom contract`
          : `Fund — ${weiToGen(totalWei)} GEN`,
      enabled: canFund,
      run: fundAction,
      busy: !!busy[`fund-${grant.id}`],
      busyLabel: "Funding…",
      reason: !account
        ? "Connect a wallet first."
        : !isGrantor
          ? "Only the grantor can fund this grant."
          : "Funding is not available right now.",
      note: "Funding locks the exact total. A wrong amount or a funder who is not the grantor is refunded in full by the contract.",
    },
    {
      key: "evidence",
      label: showEvidence ? "Close evidence form" : "Submit evidence",
      enabled: canEvidence,
      run: () => (account ? setShowEvidence((s) => !s) : openChooser()),
      busy: false,
      busyLabel: "",
      reason: !account
        ? "Connect a wallet first."
        : !isBuilder
          ? "Only the builder can submit evidence for this milestone."
          : "Evidence is not available right now.",
      note: isBuilder
        ? "You are the builder — submit evidence links for this milestone."
        : "Only the builder can submit evidence for this milestone.",
    },
    {
      key: "assess",
      label: "Assess milestone — run the AI jury",
      enabled: canAssess,
      run: () => onAssess(grant),
      busy: !!busy[`assess-${grant.id}`],
      busyLabel: "Jury assessing…",
      reason: !account
        ? "Connect a wallet first."
        : !isParty
          ? "Only the grantor or builder can run the jury — the contract accepts assessment from a party to the grant only."
          : "Assessment is not available right now.",
    },
    {
      key: "release",
      label:
        current?.status === "PARTIAL"
          ? `Release partial tranche — ${mVerdict ? mVerdict.payout_pct : ""}% of ${weiToGen(current.amount_wei)} GEN to builder`
          : `Release tranche — ${current ? weiToGen(current.amount_wei) : ""} GEN to builder`,
      enabled: canRelease,
      run: () => onRelease(grant),
      busy: !!busy[`release-${grant.id}`],
      busyLabel: "Releasing…",
      reason: isPaused
        ? "Releases are paused — the owner must resume the protocol first. An awarded tranche cannot be reclaimed by cancelling while it is unpaid."
        : !account
          ? "Connect a wallet first."
          : !isGrantor
            ? `The jury said ${mVerdictName}. Only the grantor can release the tranche.`
            : "Release is not available right now.",
      note:
        current?.status === "PARTIAL" && isGrantor
          ? `The jury said PARTIAL — releasing pays ${mVerdict ? mVerdict.payout_pct : ""}% to the builder and credits the rest to the grantor at the same time.`
          : "",
    },
    {
      key: "appeal",
      label: "Request the one appeal",
      enabled: canAppeal,
      run: () => onAppeal(grant),
      busy: !!busy[`appeal-${grant.id}`],
      busyLabel: "Requesting…",
      reason: !account
        ? "Connect a wallet first."
        : !isBuilder
          ? "The jury said NOT_MET. Only the builder can request the one appeal — after that, the second verdict is final."
          : "The appeal is not available right now.",
      note:
        mVerdict && mVerdictName === "NOT_MET" && current.verdict_final
          ? "The verdict is final — the one appeal has already been used."
          : "",
    },
    {
      key: "expire",
      label: `Expire milestone — refund ${current ? weiToGen(safeBig(current.amount_wei) - safeBig(current.paid_wei)) : ""} GEN to grantor`,
      enabled: canExpire,
      run: () => onExpire(grant),
      busy: !!busy[`expire-${grant.id}`],
      busyLabel: "Expiring…",
      reason: !account
        ? "Connect a wallet first."
        : !deadlinePassed(current)
          ? "This milestone can only expire after its deadline passes."
          : "Expiry is not available right now.",
    },
    {
      key: "cancel",
      label: "Cancel grant — refund unclaimed escrow",
      enabled: canCancel,
      // Two-step: the first tap opens an inline confirmation panel (below
      // the action block) spelling out the refund and that the grant
      // closes for good — a stray tap can no longer cancel a live grant.
      run: () => setCancelConfirm(true),
      busy: !!busy[`cancel-${grant.id}`],
      busyLabel: "Cancelling…",
      danger: true,
      reason: cancelBlocked
        ? current?.appeal_pending
          ? "Cancelling is paused while the builder's appeal is open — the second verdict settles it."
          : current?.status === "SUBMITTED"
            ? "Cancelling is paused while the jury has the milestone — wait for the verdict."
            : "Cancelling is paused while the jury-awarded tranche is unpaid — release it first."
        : !account
          ? "Connect a wallet first."
          : !isGrantor
            ? "Only the grantor can cancel this grant."
            : "Cancelling is not available right now.",
    },
  ];

  // Primary: Connect wallet when signed out on a live grant, else the
  // first enabled action in priority order (cancel never primary).
  const primaryAction = !account && (grant.status === "PENDING_FUNDING" || grant.status === "FUNDED")
    ? { key: "connect", label: "Connect wallet", run: openChooser, busy: false, busyLabel: "" }
    : actionDefs.find((a) => a.enabled && a.key !== "cancel") || null;
  const menuActions = actionDefs.filter((a) => !primaryAction || a.key !== primaryAction.key);
  // No primary action: say WHY, for this grant's actual state — never a
  // generic reason (the fund reason on a FUNDED grant would be wrong).
  const noActionHint = !primaryAction
    ? grant.status === "PENDING_FUNDING"
      ? "Only the grantor can fund this grant."
      : grant.status === "FUNDED" && current?.status === "OPEN"
        ? "Only the builder can submit evidence for this milestone."
        : grant.status === "FUNDED" && current?.status === "SUBMITTED"
          ? "Only the grantor or builder can run the jury — the contract accepts assessment from a party to the grant only."
          : grant.status === "FUNDED" && ["APPROVED", "PARTIAL"].includes(current?.status)
            ? isPaused
              ? "Releases are paused — the owner must resume the protocol first."
              : `The jury said ${mVerdictName}. Only the grantor can release the tranche.`
            : grant.status === "FUNDED" && mVerdict && mVerdictName === "NOT_MET" && current.verdict_final
              ? "The verdict is final — the one appeal has already been used."
              : grant.status === "FUNDED" && mVerdict && mVerdictName === "NOT_MET"
                ? "The jury said NOT_MET. Only the builder can request the one appeal — after that, the second verdict is final."
                : grant.status === "FUNDED" && expirable(current)
                  ? "This milestone can only expire after its deadline passes."
                  : "No action is available on this grant right now."
    : "";

  return (
    <article id="grant-file" className="mt-6 rounded-3xl glass shadow-card">
      <button
        onClick={() => {
          selectGrant(null);
          requestAnimationFrame(() =>
            document
              .getElementById(`grant-card-${grant.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          );
        }}
        className="px-4 pt-4 text-sm font-bold text-acid hover:underline sm:px-6"
      >
        ‹ All grants
      </button>
      {/* Grant header — Grant #N is the primary line */}
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold">Grant #{grant.id}</p>
            <h3 className="font-display text-2xl font-bold leading-tight">{grant.title}</h3>
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={copyGrantLink}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-acid/60"
              aria-label={`Copy link to grant ${grant.id}`}
              title="Copy a link to this grant"
            >
              {copied ? "✓ Copied" : "⧉ Copy link"}
            </button>
            <Chip value={grant.status} />
            {account && isGrantor && (
              <span className="rounded-full bg-mint/15 px-2.5 py-1 text-xs font-bold text-mint ring-1 ring-inset ring-line">
                You are the grantor
              </span>
            )}
            {account && isBuilder && !isGrantor && (
              <span className="rounded-full bg-cyan/15 px-2.5 py-1 text-xs font-bold text-cyan ring-1 ring-inset ring-line">
                You are the builder
              </span>
            )}
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
            {builderRecord && builderRecord.assessed > 0 ? (
              <dd className="mt-0.5">
                <button
                  onClick={() => {
                    filterBuilder(grant.builder);
                    setView("flow");
                    try {
                      document
                        .querySelector('[aria-label="Grants"]')
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } catch {}
                  }}
                  className="text-xs font-semibold text-acid hover:underline"
                  title="Show only this builder's judged milestones"
                >
                  Builder record — {builderRecord.assessed} judged ›
                </button>
                <span className="block text-xs text-steel">{builderRibbon}</span>
              </dd>
            ) : (
              builderRibbon && <dd className="mt-0.5 text-xs text-steel">{builderRibbon}</dd>
            )}
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
        <p className="mt-2 text-sm">
          <a className="font-semibold text-acid hover:underline" href={explorerAddr(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
            View on Explorer ↗
          </a>
          <span className="text-steel"> · contract {shortAddress(CONTRACT_ADDRESS)}</span>
        </p>
        <GrantProgress grant={grant} />
      </header>

      {/* Milestones */}
      <section className="px-4 py-4 sm:px-6">
        <h4 className="font-display text-lg font-bold">Milestones</h4>
        <ol className="mt-3 grid gap-4">
          {grant.milestones.map((m, idx) => {
            const isCurrent = idx === Number(grant.current_milestone);
            if (!isCurrent) {
              // A settled milestone keeps its jury record visible: the
              // verdict card renders here too, not only on the current
              // milestone — on a COMPLETE grant (e.g. #16) the verdicts
              // live on the VERIFIED milestones, while the current one
              // has nothing to show yet.
              const hasJuryRecord =
                !!m.verdict || Number(m.assess_attempts || 0) > 0;
              return (
                <li
                  key={m.id}
                  id={`milestone-${idx}`}
                  className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-steel">MILESTONE {m.id}</span>
                    <Chip value={m.status} />
                    {m.verdict && <VerdictBadge verdict={m.verdict} />}
                    <span className="ml-auto font-semibold">{weiToGen(m.amount_wei)} GEN</span>
                    {safeBig(m.paid_wei) > 0n && (
                      <span className="text-xs text-steel">
                        credited {weiToGen(m.paid_wei)} GEN
                      </span>
                    )}
                  </div>
                  {hasJuryRecord && (
                    <JuryVerdictCard
                      grant={grant}
                      milestone={m}
                      milestoneIndex={idx}
                      activity={activity}
                      txLinks={txLinks}
                      assessProgress={assessProgress}
                    />
                  )}
                </li>
              );
            }

            const mVerdict = m.verdict || null;
            const mVerdictName = verdictLabel(mVerdict);
            return (
              <li
                key={m.id}
                id={`milestone-${idx}`}
                className="rounded-2xl border border-acid/50 bg-mint/10 p-4 shadow-glow sm:p-5"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-mono text-xs text-steel">MILESTONE {m.id}</span>
                  <Chip value={m.status} />
                  <span className="text-xs font-semibold text-acid">· current</span>
                  <span className="ml-auto font-semibold">{weiToGen(m.amount_wei)} GEN</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{m.spec}</p>
                <p
                  className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${deadlinePassed(m) && expirable(m) ? "font-semibold text-gold" : "text-steel"}`}
                >
                  {/* No countdown chip on a settled milestone — same rule as
                      the card: a VERIFIED/CANCELLED/EXPIRED milestone has no
                      deadline to count down to. The date still renders. */}
                  {expirable(m) && <DeadlineChip deadline={m.deadline} />}
                  <span>{deadlineText(m)}</span>
                </p>
                {safeBig(m.paid_wei) > 0n && (
                  <p className="mt-1 text-sm font-semibold text-acid">
                    Credited: {weiToGen(m.paid_wei)} GEN
                    {mVerdict && mVerdict.verdict === "PARTIAL"
                      ? ` (${mVerdict.payout_pct}% of ${weiToGen(m.amount_wei)} GEN)`
                      : ""}{" "}
                    — withdraw to receive it.
                  </p>
                )}
                {safeBig(m.refunded_wei) > 0n && (
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
                      {(m.evidence.links || []).map((l, i) => {
                        const safe = safeHref(l);
                        return (
                          <li key={i}>
                            {safe ? (
                              <a href={safe} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-acid underline">
                                {l}
                              </a>
                            ) : (
                              <span className="break-all font-mono text-xs text-steel">
                                {l} (not a web link)
                              </span>
                            )}
                          </li>
                        );
                      })}
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
                {m.status === "SUBMITTED" && m.evidence && (
                  <p className="mt-2 text-sm font-semibold text-cyan">
                    Evidence received — jury is fetching
                    {evidenceSubmittedAt ? ` · ${new Date(evidenceSubmittedAt).toLocaleString()}` : ""}. Assessment takes 1–3
                    minutes across the Bradbury validators.
                  </p>
                )}

                {/* Jury verdict card — the real jury record: verdict, payout,
                    attempts, validator count, evidence hash, grounding
                    receipt, appeal delta, and the live progress bar while
                    an assess is in flight. Shown when there is a verdict,
                    a failed attempt, or an assessment running for this grant. */}
                {(mVerdict ||
                  Number(m.assess_attempts || 0) > 0 ||
                  (assessProgress &&
                    Number(assessProgress.grantId) === Number(grant.id))) && (
                  <JuryVerdictCard
                    grant={grant}
                    milestone={m}
                    milestoneIndex={idx}
                    activity={activity}
                    txLinks={txLinks}
                    assessProgress={assessProgress}
                  />
                )}

                {/* Evidence form — builder only, milestone open */}
                {showEvidence && m.status === "OPEN" && (
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
                    <p className={`mt-1 text-xs ${tooManyLinks ? "font-semibold text-rose" : "text-steel"}`}>
                      {tooManyLinks
                        ? `${evidenceLinks.length} links — remove ${evidenceLinks.length - 10} to submit. The contract accepts at most 10 evidence links.`
                        : `${evidenceLinks.length} / 10 links. The contract fetches these links itself and the jury judges the fetched content — your summary is only the claim, never the evidence.`}
                    </p>
                    <button
                      onClick={submitEvidence}
                      disabled={!!busy[`evidence-${grant.id}`] || !evSummary.trim() || !evLinks.trim() || tooManyLinks}
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

      {/* One action block: a single primary CTA + "More actions ▾". Hidden
          entirely on settled grants — nothing can act on them. */}
      {!settled && (
        <section className="border-t border-line px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction && (
              <button
                onClick={primaryAction.run}
                disabled={!!primaryAction.busy}
                className="btn-primary px-4 py-2.5 text-sm"
              >
                {primaryAction.busy ? primaryAction.busyLabel : primaryAction.label}
              </button>
            )}
            {menuActions.length > 0 && (
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                className="rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-semibold transition hover:border-acid/60 active:scale-[0.98]"
              >
                More actions {menuOpen ? "▴" : "▾"}
              </button>
            )}
            {!primaryAction && noActionHint && (
              <span className="self-center text-xs text-steel">{noActionHint}</span>
            )}
          </div>
          {primaryAction?.key === "fund" && isCustomContract && confirmFund && (
            <p role="alert" className="mt-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs leading-relaxed text-gold">
              You are sending {weiToGen(totalWei)} GEN to a custom contract (
              {shortAddress(CONTRACT_ADDRESS)}) — not the official GrantFlow v3.4. The escrow goes
              to that contract. Tap the button again to confirm, or tap elsewhere to cancel.
            </p>
          )}
          {primaryAction?.note && (
            <p className="mt-2 text-xs text-steel">{primaryAction.note}</p>
          )}
          {unclaimedWei > 0n && grant.status === "FUNDED" && (
            <p className="mt-2 text-xs text-steel">Unclaimed escrow: {weiToGen(unclaimedWei)} GEN.</p>
          )}
          {!account && (
            <p className="mt-2 text-xs text-steel">
              Connect your wallet to fund, submit evidence, assess, release or cancel.
            </p>
          )}
          {menuOpen && (
            <ul className="mt-3 space-y-2">
              {menuActions.map((a) => (
                <li
                  key={a.key}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-2.5"
                >
                  <button
                    onClick={() => {
                      if (!a.enabled || a.busy) return;
                      setMenuOpen(false);
                      a.run();
                    }}
                    disabled={!a.enabled || !!a.busy}
                    className={`px-3 py-2 text-sm font-semibold ${
                      a.danger
                        ? "rounded-full border border-rose/40 bg-rose/10 text-rose transition hover:bg-rose/15 disabled:opacity-50"
                        : a.key === "appeal"
                          ? "rounded-full border border-gold/50 bg-gold/10 text-gold transition hover:bg-gold/15 disabled:opacity-50"
                          : "rounded-full border border-line bg-panel transition hover:border-acid/60 disabled:opacity-50"
                    }`}
                  >
                    {a.busy ? a.busyLabel : a.label}
                  </button>
                  {!a.enabled && <span className="text-xs text-steel">{a.reason}</span>}
                  {a.enabled && a.note && <span className="text-xs text-steel">{a.note}</span>}
                </li>
              ))}
            </ul>
          )}
          {cancelConfirm && canCancel && (
            <div role="alert" className="mt-3 rounded-2xl border border-rose/40 bg-rose/10 px-4 py-3">
              <p className="text-sm font-semibold text-mist">Cancel this grant?</p>
              <p className="mt-1 text-xs leading-relaxed text-steel">
                The unclaimed escrow — {weiToGen(unclaimedWei)} GEN — is refunded to you as
                claimable credit, and the grant closes for good: the builder can no longer be
                assessed or paid on it. This cannot be undone.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setCancelConfirm(false);
                    onCancel(grant);
                  }}
                  disabled={!!busy[`cancel-${grant.id}`]}
                  className="rounded-full border border-rose/60 bg-rose/20 px-4 py-2 text-sm font-semibold text-rose transition hover:bg-rose/25 disabled:opacity-50"
                >
                  {busy[`cancel-${grant.id}`] ? "Cancelling…" : "Yes, cancel grant"}
                </button>
                <button
                  onClick={() => setCancelConfirm(false)}
                  className="rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold transition hover:border-acid/60"
                >
                  Keep grant
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Activity — this grant only, collapsed by default: the timeline
          pushed the milestones below the fold. */}
      <section className="border-t border-line px-4 py-4 sm:px-6">
        <button
          onClick={() => setActivityOpen((o) => !o)}
          aria-expanded={activityOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="font-display text-base font-bold">Activity — what the contract recorded</span>
          <span className="shrink-0 text-sm text-steel">
            {activityOpen ? "▴ Hide" : `▾ Show (${grantActivity.length})`}
          </span>
        </button>
        {activityOpen && (
          <>
            <ActivityTimeline
              entries={grantActivity}
              txLinks={txLinks}
              showAdminToggle={false}
              title=""
              loading={activityLoading}
            />
            <p className="mt-2 text-xs text-steel">
              Recorded on-chain by the contract. Amounts are GEN credited to a claim — withdraw to receive them.{" "}
              <a className="underline" href={explorerAddr(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
                Open the explorer
              </a>
            </p>
          </>
        )}
      </section>
    </article>
  );
}
