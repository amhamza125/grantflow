// GrantFlow header — wallet-first, Uniswap-model layout (own code, own
// branding). The wallet area reads store.account directly: when it is set
// the address pill shows, always — there is no second source of truth and
// no local account state. No location.reload anywhere.
import React, { useState } from "react";
import { useApp } from "../lib/store.jsx";
import { shortAddress, weiToGen } from "../lib/genlayer.js";
import { explorerAddressUrl } from "../lib/config.js";

export default function Header() {
  const {
    account,
    providerName,
    walletStatus,
    isPaused,
    theme,
    onToggleTheme,
    openChooser,
    disconnect,
    activeContract,
    isCustomContract,
    setView,
    setContractSwitcherOpen,
    walletBalance,
  } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Jump to the contract card (flow view, switcher open) — the pill is the
  // always-visible sign of which contract the dApp is reading from.
  const openContractCard = () => {
    setView("flow");
    setContractSwitcherOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("contract-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address stays visible in the pill.
    }
  };

  return (
    <header className="glass-strong sticky top-0 z-40">
      <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-2 px-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-none tracking-tight">
            <span className="text-gradient">GrantFlow</span>
          </h1>
          <p className="mt-0.5 hidden text-[11px] tracking-wide text-steel sm:block">
            AI-jury grant payouts · GenLayer Bradbury
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            className="btn-ghost min-h-9 shrink-0 px-3 py-1.5 text-xs"
          >
            {theme === "light" ? "☾" : "☀"}
            <span className="hidden sm:inline">{theme === "light" ? " Dark" : " Light"}</span>
          </button>

          <span className="hidden shrink-0 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold sm:inline-block">
            Bradbury · 4221
          </span>

          {/* Active-contract pill — gold while a custom contract is in use. */}
          <button
            onClick={openContractCard}
            title={
              isCustomContract
                ? `Custom contract ${activeContract} — tap to switch back to the official contract`
                : `Official contract ${activeContract} — tap to test a custom contract`
            }
            className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-xs font-bold ring-1 ring-inset ring-line ${
              isCustomContract ? "bg-gold/15 text-gold" : "bg-panel text-steel"
            }`}
          >
            {shortAddress(activeContract)}
          </button>

          {isPaused && (
            <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
              Paused
            </span>
          )}

          {account ? (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-label={`Wallet ${shortAddress(account)} — open account menu`}
                className="btn-primary min-h-9 px-3 py-2 font-mono text-xs"
                title={account}
              >
                {shortAddress(account)}
                {walletBalance !== null && walletBalance !== undefined ? ` · ${weiToGen(walletBalance)} GEN` : ""}
              </button>
              {menuOpen && (
                <div className="glass absolute right-0 top-11 w-64 rounded-2xl p-2 shadow-card">
                  <p className="break-all px-2 pb-1 pt-2 font-mono text-xs text-steel" title={account}>
                    {account}
                  </p>
                  {walletBalance !== null && walletBalance !== undefined && (
                    <p className="px-2 pb-1 text-xs font-semibold">
                      Balance: {weiToGen(walletBalance)} GEN
                    </p>
                  )}
                  {providerName && (
                    <p className="px-2 pb-2 text-xs text-steel">Connected via {providerName}</p>
                  )}
                  <button
                    onClick={copyAddress}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-panelStrong"
                  >
                    {copied ? "✓ Address copied" : "⧉ Copy address"}
                  </button>
                  <a
                    href={explorerAddressUrl(account)}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-panelStrong"
                  >
                    View on Explorer ↗
                  </a>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      disconnect();
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose hover:bg-panelStrong"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openChooser}
              disabled={walletStatus === "connecting"}
              className="btn-primary min-h-9 shrink-0 px-4 py-2 text-sm"
            >
              {walletStatus === "connecting" ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
