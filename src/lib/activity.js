// Activity → visual timeline data for the rebuilt dApp. Pure helpers, no React.
//
// The contract stores each event with structured fields (type, grant_id,
// milestone_id, verdict, payout_pct, amount_wei, recipient) plus seq — no
// tx hash, no block, no timestamp (see rebuild/tx-hash-finding.md). This
// module turns those fields into what the timeline renders: a plain
// sentence, a verdict icon, a tone, and the grant it belongs to.
//
// Fixes over the old ActivityFeed:
//   * "1 milestones" → "1 milestone" (pluralize);
//   * WITHDRAW / CONFIRM / RESTORE carry no grant_id — they are wallet
//     events, not grant events, and must never render inside a grant file;
//   * every entry gets a verdict icon + tone so the timeline is visual,
//     not rows of text.
import { shortAddress, weiToGen } from "./genlayer.js";

export const ADMIN_TYPES = new Set(["PAUSE", "RESUME", "SWEEP", "TRANSFER_OWNERSHIP"]);
// Wallet-level entries: no grant_id, they belong to My Funds / Ledger.
export const WALLET_TYPES = new Set(["WITHDRAW", "CONFIRM", "RESTORE"]);

function plural(n, one, many) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

// Pull a number out of the raw message as a fallback when the structured
// field is missing (older entries). Matches "123456789 wei".
function weiFromMessage(message) {
  const m = String(message || "").match(/(\d{10,}) wei/);
  return m ? m[1] : null;
}

export function grantOf(a) {
  if (a.grant_id !== undefined && a.grant_id !== null) return Number(a.grant_id);
  const m = String(a.message || "").match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}

export function milestoneOf(a) {
  if (a.milestone_id !== undefined && a.milestone_id !== null) return Number(a.milestone_id);
  const m = String(a.message || "").match(/milestone (\d+)/);
  return m ? Number(m[1]) : null;
}

export function amountGen(a, fields) {
  for (const field of fields || []) {
    const raw = a[field];
    if (raw !== undefined && raw !== null) {
      try {
        return weiToGen(raw);
      } catch {
        return null;
      }
    }
  }
  const fromMsg = weiFromMessage(a.message);
  return fromMsg ? weiToGen(fromMsg) : null;
}

/** Verdict icon + label + tone for an ASSESS / failure entry. */
export function verdictInfo(a) {
  const type = a.type || "";
  if (type === "ASSESS") {
    const verdict = a.verdict || (a.met ? "MET" : "NOT_MET");
    const pct = a.payout_pct !== undefined && a.payout_pct !== null ? Number(a.payout_pct) : null;
    if (verdict === "MET") return { icon: "✓", label: "MET", tone: "good", pct: 100 };
    if (verdict === "PARTIAL")
      return { icon: "◐", label: "PARTIAL", tone: "warn", pct };
    return { icon: "✗", label: "NOT_MET", tone: "bad", pct: 0 };
  }
  if (type === "JURY_FAILURE")
    return { icon: "⚠", label: "NO VERDICT", tone: "warn", pct: null };
  if (type === "EVIDENCE_FAILURE")
    return { icon: "⚠", label: "EVIDENCE FAILED", tone: "warn", pct: null };
  return null;
}

/** Tone for a type: good | warn | bad | info | admin. */
export function kindOf(type) {
  if (type === "ASSESS" || type === "FUND" || type === "CONFIRM") return "good";
  if (type === "RELEASE" || type === "WITHDRAW") return "good";
  if (type === "EXPIRE" || type === "CANCEL" || type === "JURY_FAILURE" || type === "EVIDENCE_FAILURE")
    return "warn";
  if (type === "PAUSE" || type === "RESUME" || type === "SWEEP" || type === "TRANSFER_OWNERSHIP")
    return "admin";
  return "info";
}

/**
 * Ledger filter category for an entry type: "funds" | "evidence" |
 * "jury" | "payout" | "admin" | null (unknown — visible only under All).
 * Counts on the Ledger pills are computed LIVE from the matched entries
 * at runtime — never from tx counts (a tx count is not an entry count).
 */
export function ledgerCategory(type) {
  switch (type) {
    case "CREATE":
    case "FUND":
      return "funds";
    case "EVIDENCE":
    case "EVIDENCE_FAILURE":
      return "evidence";
    case "ASSESS":
    case "JURY_FAILURE":
    case "APPEAL":
      return "jury";
    case "RELEASE":
    case "EXPIRE":
    case "CANCEL":
    case "WITHDRAW":
    case "CONFIRM":
    case "RESTORE":
      return "payout";
    case "PAUSE":
    case "RESUME":
    case "SWEEP":
    case "TRANSFER_OWNERSHIP":
      return "admin";
    default:
      return null;
  }
}
/** One entry → plain sentence (string). No JSX here — the component renders it. */
export function describeText(a) {
  const g = grantOf(a);
  const m = milestoneOf(a);
  const where = g !== null ? `Grant #${g}` : "A grant";
  const mile = m !== null ? `, milestone ${m}` : "";
  const type = a.type || "EVENT";

  switch (type) {
    case "CREATE": {
      const title = a.title || (a.message || "").match(/'([^']+)'/)?.[1];
      const milestones = a.milestone_count ?? (a.message || "").match(/(\d+) milestones/)?.[1];
      const amt = amountGen(a, ["escrow_wei", "amount_wei"]);
      return `${where} created${title ? ` — "${title}"` : ""}${
        milestones ? `, ${plural(milestones, "milestone", "milestones")}` : ""
      }${amt ? `, ${amt} GEN to fund` : ""}. Waiting for funding.`;
    }
    case "FUND": {
      const amt = amountGen(a, ["escrow_wei", "amount_wei"]);
      return `${where} funded${amt ? ` with ${amt} GEN` : ""}.`;
    }
    case "EVIDENCE":
      return `${where}${mile}: evidence submitted — waiting for the jury.`;
    case "APPEAL":
      return `${where}${mile}: appeal requested — one re-assessment with fresh evidence.`;
    case "JURY_FAILURE":
      return `${where}${mile}: the jury couldn't reach a verdict${
        a.reason ? ` (${a.reason})` : ""
      } — no verdict yet, still waiting.`;
    case "EVIDENCE_FAILURE":
      return `${where}${mile}: the evidence couldn't be fetched${
        a.code ? ` (${a.code})` : ""
      } — no verdict, milestone reopened.`;
    case "ASSESS": {
      const verdict = a.verdict || (a.met ? "MET" : "NOT_MET");
      const pct = a.payout_pct !== undefined && a.payout_pct !== null ? Number(a.payout_pct) : null;
      if (verdict === "MET") return `${where}${mile}: jury said MET — 100% paid.`;
      if (verdict === "PARTIAL")
        return `${where}${mile}: jury said PARTIAL${
          pct !== null ? ` — ${pct}% paid` : ""
        }, the rest back to the grantor.`;
      return `${where}${mile}: jury said NOT_MET — nothing paid.`;
    }
    case "RELEASE": {
      const msg = String(a.message || "");
      const paid = msg.match(/recorded (\d+) wei claimable by builder/)?.[1];
      const rest = msg.match(/(\d+) wei claimable by grantor/)?.[1];
      const pct = msg.match(/\((\d+)%\)/)?.[1];
      return `${where}${mile}: ${paid ? `${weiToGen(paid)} GEN to the builder` : "tranche released"}${
        rest ? ` and ${weiToGen(rest)} GEN back to the grantor` : ""
      }${pct ? ` (${pct}% paid)` : ""} — credited, withdraw to receive.`;
    }
    case "EXPIRE": {
      const amt = amountGen(a, ["refund_wei", "amount_wei"]);
      return `${where}${mile}: deadline passed${
        amt ? ` — ${amt} GEN back to the grantor` : ""
      } (credited, withdraw to receive).`;
    }
    case "CANCEL": {
      const amt = amountGen(a, ["refund_wei", "amount_wei"]);
      const beforeFunding = String(a.message || "").includes("before funding");
      return `${where} cancelled${beforeFunding ? " before funding" : ""}${
        amt ? ` — ${amt} GEN back to the grantor` : ""
      }.`;
    }
    case "WITHDRAW": {
      const amt = amountGen(a, ["amount_wei"]);
      return `Withdrawal started${amt ? `: ${amt} GEN` : ""} — confirm it when it arrives in your wallet.`;
    }
    case "CONFIRM": {
      const amt = amountGen(a, ["amount_wei"]);
      return `Withdrawal confirmed${amt ? `: ${amt} GEN received` : "."}`;
    }
    case "RESTORE": {
      const amt = amountGen(a, ["amount_wei"]);
      return `Pending withdrawal restored${amt ? `: ${amt} GEN back to claimable` : "."}`;
    }
    case "PAUSE":
      return "Protocol paused by the owner.";
    case "RESUME":
      return "Protocol resumed by the owner.";
    case "SWEEP": {
      const amt = amountGen(a, ["amount_wei"]);
      return `Excess ${amt ?? "…"} GEN swept to the owner.`;
    }
    case "TRANSFER_OWNERSHIP": {
      const msg = String(a.message || "");
      const addrs = [...msg.matchAll(/0x[a-fA-F0-9]{40}/g)].map((x) => x[0]);
      const requested = msg.includes("REQUESTED");
      return `Ownership transfer ${requested ? "requested" : "completed"}${
        addrs.length >= 2
          ? `: ${shortAddress(addrs[0])} → ${shortAddress(addrs[1])}`
          : "."
      }`;
    }
    default:
      return a.message || "Contract event recorded.";
  }
}

export function isAdminEntry(a) {
  return ADMIN_TYPES.has(a.type);
}

export function isWalletEntry(a) {
  return WALLET_TYPES.has(a.type);
}

/** Entries for one grant file — only entries that name this grant. */
export function filterForGrant(activity, grantId) {
  const id = Number(grantId);
  return (activity || []).filter((a) => grantOf(a) === id);
}

/** Split a newest-first list into main + admin (protocol) entries. */
export function splitAdmin(activity) {
  const main = [];
  const admin = [];
  for (const a of activity || []) {
    if (isAdminEntry(a)) admin.push(a);
    else main.push(a);
  }
  return { main, admin };
}

/**
 * Progress steps for a grant: Funded → Evidence → Jury → Payout.
 * Each step: { key, label, state: "done" | "current" | "waiting" | "failed", note }.
 * Derived from the grant + its current milestone only — never from titles.
 */
export function progressFor(grant) {
  if (!grant) return [];
  const status = String(grant.status || "");
  const milestones = grant.milestones || [];
  const current = milestones[Number(grant.current_milestone)] || milestones[0] || null;
  const hasEvidence =
    !!current && !!current.evidence && Array.isArray(current.evidence.links)
      ? current.evidence.links.length > 0
      : false;
  const verdict = current?.verdict || null;
  const verdictName = verdict ? verdict.verdict || (verdict.met ? "MET" : "NOT_MET") : null;
  const evidenceFailed =
    Number(current?.evidence_failures || 0) > 0 || !!current?.last_evidence_error;
  const settled =
    status === "COMPLETE" || status === "CANCELLED" || status === "EXPIRED";
  const paid = (() => {
    try {
      return BigInt(current?.paid_wei || "0") > 0n;
    } catch {
      return false;
    }
  })();
  const refunded = (() => {
    try {
      return BigInt(grant.refunded_wei || "0") > 0n;
    } catch {
      return false;
    }
  })();
  // Grant-level release: did the builder actually get paid anything?
  // A CANCELLED / EXPIRED grant (or a COMPLETE one with a NOT_MET verdict)
  // pays the builder nothing — the escrow went back to the grantor, so the
  // last step must read "Refunded", never "Payout ✓ Settled".
  const released = (() => {
    try {
      return BigInt(grant.released_wei || "0") > 0n;
    } catch {
      return false;
    }
  })();
  const refundedOnly = !released && refunded;

  const funded =
    status === "PENDING_FUNDING"
      ? { key: "funded", label: "Funded", state: "current", note: "Waiting for escrow" }
      : { key: "funded", label: "Funded", state: "done", note: "Escrow locked" };

  let evidence;
  if (status === "PENDING_FUNDING") {
    evidence = { key: "evidence", label: "Evidence", state: "waiting", note: "After funding" };
  } else if (verdictName || hasEvidence) {
    evidence = { key: "evidence", label: "Evidence", state: "done", note: "Links filed on chain" };
  } else {
    evidence = { key: "evidence", label: "Evidence", state: "current", note: "Builder files links" };
  }

  let jury;
  if (verdictName) {
    jury = {
      key: "jury",
      label: "Jury",
      state: verdictName === "NOT_MET" ? "failed" : "done",
      note: `Verdict: ${verdictName}`,
    };
  } else if (evidenceFailed) {
    jury = { key: "jury", label: "Jury", state: "failed", note: "Evidence unreachable" };
  } else if (hasEvidence) {
    jury = { key: "jury", label: "Jury", state: "current", note: "Jury is fetching" };
  } else {
    jury = { key: "jury", label: "Jury", state: "waiting", note: "After evidence" };
  }

  let payout;
  if (settled && (paid || refunded || status === "CANCELLED" || status === "EXPIRED")) {
    if (status === "CANCELLED" || status === "EXPIRED" || refundedOnly) {
      payout = {
        key: "payout",
        label: "Refunded",
        state: "done",
        note: "Returned to grantor",
      };
    } else {
      payout = {
        key: "payout",
        label: "Payout",
        state: "done",
        note: "Paid out",
      };
    }
  } else if (verdictName === "NOT_MET") {
    payout = { key: "payout", label: "Payout", state: "done", note: "Nothing paid" };
  } else if (verdictName) {
    payout = { key: "payout", label: "Payout", state: "current", note: "Release the tranche" };
  } else {
    payout = { key: "payout", label: "Payout", state: "waiting", note: "After the verdict" };
  }

  return [funded, evidence, jury, payout];
}
