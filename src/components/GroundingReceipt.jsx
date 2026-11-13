// Grounding receipt as an expanding paper slip.
// The verdict's grounding receipt — artifacts fetched, evidence sha256
// (SHA-256 of ALL fetched cleaned evidence bodies, joined in link order),
// and the jury's reasons quoted — opens as a thin translucent slip sliding
// out from under the verdict card. Everything shown comes from the verdict
// stored on chain; nothing is paraphrased or added. The score stays null
// and the reasons stay generic by design — the receipt proves which
// artifacts were hashed, not the full reasoning behind the verdict.
import React, { useState } from "react";

export default function GroundingReceipt({ verdict, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const grounding = verdict.grounding || {};
  const reasons = verdict.reasons || [];
  const evidenceSha = grounding.evidence_sha256 || grounding.primary_sha256 || null;
  const slipId = `receipt-${evidenceSha || "na"}`.slice(0, 48);
  const copySha = async () => {
    if (!evidenceSha) return;
    try {
      await navigator.clipboard.writeText(evidenceSha);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the hash stays visible above.
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={slipId}
        className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-acid/60"
      >
        {open ? "▾ Hide grounding receipt" : "▸ Grounding receipt"}
      </button>
      <div id={slipId} className={`receipt-slip ${open ? "receipt-slip--open" : ""}`}>
        <div className="receipt-slip__inner">
          <div className="receipt-slip__paper mt-0 p-3 font-mono text-xs sm:p-4">
            <p className="font-sans text-xs font-bold uppercase tracking-widest text-steel">
              Grounding receipt — what the jury actually fetched
            </p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-steel">Artifacts fetched:</dt>
                <dd>{grounding.artifacts_fetched ?? "not recorded"}</dd>
              </div>
              {grounding.artifacts_unavailable !== undefined && grounding.artifacts_unavailable !== null && Number(grounding.artifacts_unavailable) > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-steel">Artifacts unavailable:</dt>
                  <dd>{grounding.artifacts_unavailable}</dd>
                </div>
              )}
              <div>
                <dt className="text-steel">Evidence sha256 (all fetched bodies):</dt>
                <dd className="break-all">{evidenceSha || "not recorded"}</dd>
                {evidenceSha && (
                  <dd className="mt-1">
                    <button
                      onClick={copySha}
                      className="rounded-full border border-line bg-panel px-3 py-1.5 font-sans text-xs font-semibold transition hover:border-acid/60"
                    >
                      {copied ? "✓ Copied" : "⧉ Copy hash"}
                    </button>
                  </dd>
                )}
              </div>
            </dl>
            {reasons.length > 0 && (
              <figure className="mt-3 border-l-2 border-acid/60 pl-3 font-sans text-sm leading-relaxed">
                <figcaption className="font-mono text-xs text-steel">Jury&apos;s reasons, quoted:</figcaption>
                <ul className="mt-1 list-disc pl-4">
                  {reasons.map((r, i) => (
                    <li key={i} className="mt-1">
                      &ldquo;{r}&rdquo;
                    </li>
                  ))}
                </ul>
              </figure>
            )}
            <p className="mt-3 font-sans text-xs text-steel">
              The verdict stands on the fetched artifacts above — the builder&apos;s summary is only the
              claim, never the evidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
