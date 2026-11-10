// Grounding receipt as an expanding paper slip.
// The verdict's grounding receipt — artifacts fetched, primary sha256,
// and the jury's reasons quoted — opens as a thin translucent slip sliding
// out from under the verdict card. Everything shown comes from the verdict
// stored on chain; nothing is paraphrased or added.
import React, { useState } from "react";

export default function GroundingReceipt({ verdict }) {
  const [open, setOpen] = useState(false);
  const grounding = verdict.grounding || {};
  const reasons = verdict.reasons || [];
  const slipId = `receipt-${verdict.primary_sha256 || "na"}`.slice(0, 48);

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
              <div>
                <dt className="text-steel">Primary sha256:</dt>
                <dd className="break-all">{grounding.primary_sha256 || "not recorded"}</dd>
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
