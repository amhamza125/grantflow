// Verdict badge — the verdict icon + label, shared by the grant file,
// the activity timeline and anywhere else a verdict is shown.
//
// Accepts every verdict shape the app carries and normalises internally:
//   * verdictInfo() objects: { icon, label, tone, pct }
//   * a milestone verdict object: { verdict: "MET"|"PARTIAL"|"NOT_MET",
//     payout_pct, met }
//   * a plain string: "MET" | "PARTIAL" | "NOT_MET"
//   * null / undefined → waiting (no verdict yet)
//   * { unreachable: true } or an EVIDENCE_FAILURE entry → evidence unreachable
// Tone: good = emerald, warn = amber, bad = crimson, waiting = slate.
import React from "react";

export function normalizeVerdict(v) {
  if (v === null || v === undefined) {
    return { icon: "⏳", label: "Waiting", tone: "waiting", pct: null };
  }
  if (typeof v === "string") {
    const name = v.toUpperCase();
    if (name === "MET") return { icon: "✓", label: "MET", tone: "good", pct: 100 };
    if (name === "PARTIAL") return { icon: "◐", label: "PARTIAL", tone: "warn", pct: null };
    if (name === "NOT_MET") return { icon: "✗", label: "NOT_MET", tone: "bad", pct: 0 };
    return { icon: "⏳", label: v, tone: "waiting", pct: null };
  }
  // verdictInfo() shape — already normalised, use it as-is.
  if (typeof v === "object" && v.icon && v.label) {
    return {
      icon: v.icon,
      label: v.label,
      tone: v.tone || "waiting",
      pct: v.pct !== undefined && v.pct !== null ? Number(v.pct) : null,
    };
  }
  if (typeof v === "object") {
    if (v.unreachable || v.type === "EVIDENCE_FAILURE") {
      return { icon: "⚠", label: "Evidence unreachable", tone: "warn", pct: null };
    }
    if (v.type === "JURY_FAILURE") {
      return { icon: "⚠", label: "No verdict", tone: "warn", pct: null };
    }
    const name = v.verdict || (v.met === true ? "MET" : v.met === false ? "NOT_MET" : null);
    const pct =
      v.payout_pct !== undefined && v.payout_pct !== null ? Number(v.payout_pct) : null;
    if (name === "MET") return { icon: "✓", label: "MET", tone: "good", pct: 100 };
    if (name === "PARTIAL") return { icon: "◐", label: "PARTIAL", tone: "warn", pct };
    if (name === "NOT_MET") return { icon: "✗", label: "NOT_MET", tone: "bad", pct: 0 };
  }
  return { icon: "⏳", label: "Waiting", tone: "waiting", pct: null };
}

const TONE_STYLE = {
  good: "bg-mint/15 text-mint",
  warn: "bg-gold/15 text-gold",
  bad: "bg-rose/15 text-rose",
  waiting: "bg-panelStrong text-steel",
};

export default function VerdictBadge({ verdict }) {
  const v = normalizeVerdict(verdict);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-line ${TONE_STYLE[v.tone] || TONE_STYLE.waiting}`}
    >
      <span aria-hidden="true">{v.icon}</span>
      {v.label}
      {v.label === "PARTIAL" && v.pct !== null ? ` · ${v.pct}%` : ""}
    </span>
  );
}
