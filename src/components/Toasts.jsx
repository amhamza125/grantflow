// Toast stack — renders store.toasts. Every toast with a tx hash gets a
// "View on Explorer" link; dismiss calls store.dismissToast.
import React from "react";
import { useApp } from "../lib/store.jsx";
import { explorerTxUrl } from "../lib/config.js";

const KIND_ICON = { ok: "✓", error: "✕", warn: "⚠", info: "ⓘ" };
const KIND_CLASS = {
  ok: "toast--ok",
  error: "toast--error",
  warn: "toast--warn",
  info: "toast--info",
};

export default function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${KIND_CLASS[t.kind] || KIND_CLASS.info}`}>
          <span aria-hidden="true" className="toast__icon">
            {KIND_ICON[t.kind] || "ⓘ"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.title}</p>
            {t.body && <p className="mt-1 break-words">{t.body}</p>}
            {t.txHash && (
              <a
                href={explorerTxUrl(t.txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block font-mono text-xs underline"
              >
                View on Explorer ↗
              </a>
            )}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label={`Dismiss: ${t.title}`}
            className="ml-2 shrink-0 rounded-full px-2 py-1 text-sm font-bold text-steel hover:text-mist"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
