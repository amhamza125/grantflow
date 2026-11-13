// Countdown helpers for milestone deadlines. All inputs are on-chain
// values (unix seconds); the clock is the viewer's local time.
import { useEffect, useState } from "react";

/** Current unix time, re-rendering every `intervalMs` so countdowns tick. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Glanceable countdown for a deadline (unix seconds).
 * Returns { label, tone } where tone is "ok" | "soon" | "urgent" | "expired".
 * - ok: more than 7 days left
 * - soon: 1–7 days left
 * - urgent: under 24 hours left
 * - expired: deadline passed
 */
export function countdown(deadlineSec, nowSec) {
  const d = Number(deadlineSec || 0);
  if (!d) return { label: "No deadline", tone: "soon" };
  const diff = d - nowSec;
  if (diff <= 0) return { label: "Expired", tone: "expired" };
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 7) return { label: `${days} days left`, tone: "ok" };
  if (days >= 1) return { label: `${days}d ${hours}h left`, tone: "soon" };
  if (hours >= 1) return { label: `${hours}h ${mins}m left`, tone: "urgent" };
  return { label: `${Math.max(mins, 1)}m left`, tone: "urgent" };
}

export function deadlineDate(deadlineSec) {
  const d = Number(deadlineSec || 0);
  if (!d) return "";
  return new Date(d * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Honest "last read" label for a unix-ms timestamp: "just now",
 * "4 min ago", "2h ago", "3d ago". The StatsBar shows when the grants
 * were last re-read from the chain — never a guessed time.
 */
export function timeAgo(tsMs) {
  if (!tsMs) return "";
  const s = Math.max(0, Math.floor((Date.now() - Number(tsMs)) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
