// Deadline countdown chip + aurora ring — the milestone deadline made
// glanceable. Reads only the on-chain deadline (unix seconds) and the
// local clock.
//
// The ring depletes over the last 7 days before the deadline (the same
// window the chip's tones use): full and calm beyond 7 days, draining to
// empty at expiry, shifting cyan -> amber -> rose as time runs out, with a
// gentle pulse in the last 24 hours. It visualises the same countdown the
// chip already states — it never claims an elapsed fraction, because the
// contract stores no milestone creation time.
import React from "react";
import { useNow, countdown, deadlineDate } from "../lib/time.js";

const TONE_STYLE = {
  ok: "bg-mint/15 text-mint",
  soon: "bg-gold/15 text-gold",
  urgent: "bg-rose/15 text-rose",
  expired: "bg-rose/15 text-rose",
};

const TONE_STROKE = {
  ok: "#22d3ee",
  soon: "#facc15",
  urgent: "#fb7185",
  expired: "#fb7185",
};

// Seconds of the ring's depletion window: the last 7 days.
const RING_WINDOW_SEC = 7 * 86400;
const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

export default function DeadlineChip({ deadline }) {
  const now = useNow(30000);
  const d = Number(deadline || 0);
  if (!d) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-steel ring-1 ring-inset ring-line">
        No deadline
      </span>
    );
  }
  const { label, tone } = countdown(d, now);
  const remaining = Math.max(d - now, 0);
  const fraction = tone === "expired" ? 0 : Math.min(remaining / RING_WINDOW_SEC, 1);
  const urgent = tone === "urgent";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-line ${TONE_STYLE[tone]}`}
      title={`Deadline ${deadlineDate(d)}`}
      aria-label={`Deadline ${deadlineDate(d)} — ${label}`}
    >
      <svg
        className={`deadline-ring ${urgent ? "deadline-ring--urgent" : ""}`}
        width="18"
        height="18"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r={RING_R} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r={RING_R}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - fraction)}
          transform="rotate(-90 10 10)"
        />
        <circle cx="10" cy="10" r="2.5" fill={TONE_STROKE[tone]} />
      </svg>
      {label}
    </span>
  );
}
