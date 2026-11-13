// GrantFlow dApp — thin shell. All state lives in the store
// (src/lib/store.jsx); this file only lays out the page: Header,
// JourneyRibbon, StatsBar, view tabs, then either the grant flow
// (GrantList + the selected GrantDetail below it) or the Public Ledger.
// Single centred column, max-width ~720px, mobile-first.
//
// GrantDetail, Ledger and MyFunds are written by the parallel detail-side
// agent — their imports stay in place even if those files do not exist yet.
import React, { useState } from "react";
import AppProvider, { useApp } from "./lib/store.jsx";
import { weiToGen, shortAddress } from "./lib/genlayer.js";
import Header from "./components/Header.jsx";
import StatsBar from "./components/StatsBar.jsx";
import JourneyRibbon from "./components/JourneyRibbon.jsx";
import GrantList from "./components/GrantList.jsx";
import GrantDetail from "./components/GrantDetail.jsx";
import ContractCard from "./components/ContractCard.jsx";
import Ledger from "./components/Ledger.jsx";
import MyFunds from "./components/MyFunds.jsx";
import WalletChooser from "./components/WalletChooser.jsx";
import CreateGrant from "./components/CreateGrant.jsx";
import Toasts from "./components/Toasts.jsx";

function Shell() {
  const {
    account,
    view,
    setView,
    selected,
    selectGrant,
    showcaseIds,
    pushToast,
    pending,
    claimable,
    isOwner,
    busy,
    onWithdraw,
    onConfirmWithdrawal,
    onRestorePending,
    walletError,
    openChooser,
    showChooser,
    closeChooser,
    onWalletConnected,
    onWalletError,
    showCreate,
    setShowCreate,
    onCreate,
    CONTRACT_ADDRESS,
    EXPLORER_URL,
    explorerAddressUrl,
    activeContract,
    isCustomContract,
    resetContract,
    builderFilter,
    clearBuilderFilter,
    feedCounts,
    walletBalance,
  } = useApp();
  // Pure UI chrome (drawer open/closed) — not domain state, so it lives here.
  const [showFunds, setShowFunds] = useState(false);

  // Floating withdrawal pill (UX round): the permanent banner is gone —
  // the pill stays at the bottom until the withdrawal is confirmed. Two
  // modes: claimable → "Withdraw now"; pending → "Confirm receipt" (the
  // withdrawal is already in flight — withdrawing again is impossible).
  const pillVisible = !!account && (pending || claimable > 0n);

  // "Inspect a Live AI Verdict": jump to the newest showcase grant.
  const inspectVerdict = () => {
    const id = showcaseIds && showcaseIds.length > 0 ? showcaseIds[0] : null;
    if (id === null || id === undefined) {
      pushToast(
        "info",
        "No verdict yet",
        "No grant has a jury verdict on chain yet — check back after the first assessment."
      );
      return;
    }
    setView("flow");
    selectGrant(id);
    requestAnimationFrame(() => {
      document.getElementById("grant-file")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  return (
    <div className="min-h-screen bg-night font-body text-mist">
      <Header />

      {/* Custom-contract banner — pinned while a test contract is active, so
          nobody mistakes its grants for the official ones. */}
      {isCustomContract && (
        <div role="alert" className="mx-auto w-full max-w-[720px] px-4 pt-4">
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm shadow-card">
            <p className="font-semibold">
              Testing custom contract {shortAddress(activeContract)}
            </p>
            <p className="mt-1">
              This is a test contract, not the official GrantFlow v3.4. Grants here are separate,
              and every write goes to this contract only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={resetContract} className="btn-primary px-4 py-2.5 text-sm">
                Back to official v3.4
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet error — a persistent banner, not just a toast: a tap on
          Connect wallet must never appear to do nothing. */}
      {walletError && (
        <div role="alert" className="mx-auto w-full max-w-[720px] px-4 pt-4">
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm shadow-card">
            <p className="font-semibold">Wallet not connected</p>
            <p className="mt-1 break-words">{walletError}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={openChooser} className="btn-primary px-4 py-2.5 text-sm">
                Connect wallet
              </button>
            </div>
          </div>
        </div>
      )}

      <StatsBar />
      <JourneyRibbon />

      {/* The two doors in: inspect a live verdict, create a grant, my funds. */}
      <div className="mx-auto w-full max-w-[720px] px-4 pt-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={inspectVerdict} className="btn-ghost min-h-11 px-4 py-2.5 text-sm">
            Inspect a Live AI Verdict
          </button>
          <button
            onClick={() => {
              setView("flow");
              setShowCreate(true);
            }}
            className="btn-primary min-h-11 px-4 py-2.5 text-sm"
          >
            + Create a Grant
          </button>
          {account && (
            <button
              onClick={() => setShowFunds(true)}
              className="btn-ghost min-h-11 px-4 py-2.5 text-sm"
            >
              My Funds
              {feedCounts.MINE > 0 || claimable > 0n
                ? ` · ${feedCounts.MINE > 0 ? `${feedCounts.MINE} ${feedCounts.MINE === 1 ? "grant" : "grants"}` : ""}${feedCounts.MINE > 0 && claimable > 0n ? " · " : ""}${claimable > 0n ? `${weiToGen(claimable)} GEN` : ""}`
                : ""}
            </button>
          )}
        </div>
      </div>

      {/* View tabs */}
      <nav className="mx-auto flex w-full max-w-[720px] px-4 pt-4" role="tablist" aria-label="Main views">
        <div className="glass flex rounded-full p-1">
          <button
            role="tab"
            aria-selected={view === "flow"}
            onClick={() => setView("flow")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              view === "flow" ? "bg-acid text-acidInk" : "text-steel hover:text-mist"
            }`}
          >
            GrantFlow
          </button>
          <button
            role="tab"
            aria-selected={view === "ledger"}
            onClick={() => setView("ledger")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              view === "ledger" ? "bg-acid text-acidInk" : "text-steel hover:text-mist"
            }`}
          >
            Public Ledger
          </button>
        </div>
      </nav>

      <main className={`mx-auto w-full max-w-[720px] px-4 ${pillVisible ? "pb-36" : "pb-24"}`}>
        {view === "ledger" ? (
          <div className="glass fade-up mt-4 rounded-3xl p-4 shadow-card sm:p-6">
            <Ledger />
          </div>
        ) : (
          <>
            {showCreate && (
              <div id="create-form" className="mt-4">
                <CreateGrant
                  onCreate={onCreate}
                  busy={!!busy.create}
                  account={account}
                  onConnect={openChooser}
                  walletBalance={walletBalance}
                />
                <button
                  onClick={() => setShowCreate(false)}
                  className="mt-2 text-xs font-semibold text-steel hover:underline"
                >
                  Close form
                </button>
              </div>
            )}

            {/* Builder filter chip — from the jury card's "Builder record" link. */}
            {builderFilter && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-acid/40 bg-mint/10 px-3 py-2 text-sm">
                <span>
                  Showing only {shortAddress(builderFilter)}&apos;s judged milestones
                </span>
                <button
                  onClick={clearBuilderFilter}
                  className="font-bold text-acid hover:underline"
                >
                  Clear filter ×
                </button>
              </div>
            )}

            <ContractCard />

            <GrantList />

            {selected && (
              <div id="grant-file" className="mt-6">
                <GrantDetail />
              </div>
            )}
          </>
        )}

        <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-steel">
          <p>
            GrantFlow —{" "}
            <a
              className="font-mono underline"
              href={explorerAddressUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              {CONTRACT_ADDRESS}
            </a>{" "}
            on Bradbury (chain 4221). Explorer:{" "}
            <a className="underline" href={EXPLORER_URL} target="_blank" rel="noreferrer">
              {EXPLORER_URL}
            </a>
          </p>
        </footer>
      </main>

      <MyFunds open={showFunds} onClose={() => setShowFunds(false)} />

      {/* Floating withdrawal pill — stays until the withdrawal is
          confirmed. No dismiss button: the confirm is the only way out. */}
      {pillVisible && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-[720px] items-center gap-3 rounded-full border border-acid/50 bg-panel px-4 py-3 shadow-lg">
            {pending ? (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  Pending withdrawal · {weiToGen(pending.amount_wei)} GEN
                </span>
                <button
                  onClick={onConfirmWithdrawal}
                  disabled={!!busy.confirm}
                  className="btn-primary shrink-0 px-3 py-2 text-xs"
                >
                  {busy.confirm ? "Confirming…" : "Confirm receipt"}
                </button>
                <button
                  onClick={() => setShowFunds(true)}
                  className="shrink-0 text-xs font-semibold text-steel underline"
                >
                  Didn&apos;t arrive?
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  My claimable · {weiToGen(claimable)} GEN
                </span>
                <button
                  onClick={onWithdraw}
                  disabled={!!busy.withdraw}
                  className="btn-primary shrink-0 px-3 py-2 text-xs"
                >
                  {busy.withdraw ? "Withdrawing…" : "Withdraw now"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showChooser && (
        <WalletChooser
          onClose={closeChooser}
          onConnected={onWalletConnected}
          onError={onWalletError}
        />
      )}

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
