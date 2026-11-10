// Verdict seal materialization.
// When a jury result is first seen in this session, a holographic circular
// seal (MET / NOT_MET / PARTIAL) assembles from particles over ~1.2s, then
// settles with a soft flash before locking. A verdict seen before in this
// session renders settled — the animation marks arrival, not every re-read.
// Reduced motion: settled immediately, no particles.
import React, { useRef } from "react";

// Verdicts already animated in this session — module-level so a re-mount
// (view switch, chain refresh) does not replay the arrival.
const seenSeals = new Set();

const SEAL_STYLE = {
  MET: { ring: "#a3e635", word: "#a3e635", label: "MET" },
  NOT_MET: { ring: "#fb7185", word: "#fb7185", label: "NOT_MET" },
  PARTIAL: { ring: "#facc15", word: "#facc15", label: "PARTIAL" },
};

// Eight particles start scattered around the seal and converge onto it.
const PARTICLES = [
  { x: -34, y: -26 }, { x: 30, y: -30 }, { x: 36, y: 8 }, { x: 22, y: 32 },
  { x: -28, y: 30 }, { x: -36, y: 4 }, { x: 0, y: -38 }, { x: 4, y: 38 },
];

export default function VerdictSeal({ verdict, sealKey }) {
  const style = SEAL_STYLE[verdict] || SEAL_STYLE.NOT_MET;
  const keyRef = useRef(sealKey || verdict);
  const firstSight = !seenSeals.has(keyRef.current);
  if (firstSight) seenSeals.add(keyRef.current);

  return (
    <div
      className={`verdict-seal ${firstSight ? "verdict-seal--animating" : ""}`}
      role="img"
      aria-label={`Jury verdict seal: ${style.label}`}
      title={`Jury verdict: ${style.label}`}
    >
      <svg className="seal-ring" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`seal-grad-${style.label}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" fill="none" stroke={`url(#seal-grad-${style.label})`} strokeWidth="1.5" opacity="0.9" />
        <circle cx="32" cy="32" r="24" fill="none" stroke={style.ring} strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
        <circle cx="32" cy="32" r="29" fill="none" stroke={style.ring} strokeWidth="0.5" opacity="0.4" />
        {firstSight &&
          PARTICLES.map((p, i) => (
            <circle
              key={i}
              className="seal-particle"
              cx="32"
              cy="32"
              r="2"
              fill={style.ring}
              style={{ "--px": `${p.x}px`, "--py": `${p.y}px`, animationDelay: `${i * 0.06}s` }}
            />
          ))}
      </svg>
      <span className="seal-word" style={{ color: style.word }}>
        {style.label}
      </span>
    </div>
  );
}
