// My Funds — the wallet drawer.
// Props: { open, onClose }. When closed, renders nothing.
//
// Sections: your claimable balance (GEN) with Withdraw; a pending
// withdrawal banner (amount + initiated time + Confirm, with the warning to
// confirm only if the GEN arrived); an accept-ownership button when a
// transfer is pending to this wallet; and the owner panel — pause/resume,
// transfer ownership, restore pending, sweep excess — ONLY when store.isOwner.
import React, { useState } from "react";
import { useApp } from "../lib/store.jsx";
import { shortAddress, weiToGen } from "../lib/genlayer.js";

export default function MyFunds({ open, onClose }) {
  const {
    account,
    claimable,
    pending,
    isOwner,
    isPaused,
    overview,
    busy,
    onWithdraw,
    onConfirmWithdrawal,
    onRestorePending,
    onPause,
    onTransferOwnership,
    onAcceptOwnership,
    onSweep,
    openChooser,
  } = useApp();
  const [transferAddr, setTransferAddr] = useState("");
  const [restoreAddr, setRestoreAddr] = useState("");

  if (!open) return null;

  const claimableGen = (() => {
    try {
      return weiToGen(claimable || 0n);
    } catch {
      return "0";
    }
  })();
  const hasClaimable = (() => {
    try {
      return BigInt(claimable || 0n) > 0n;
    } catch {
      return false;
    }
  })();
  const pendingAmount = pending ? weiToGen(pending.amount_wei) : null;
  const pendingStarted = pending?.initiated_at
    ? new Date(Number(pending.initiated_at) * 1000).toLocaleString()
    : null;
  const pendingOwner = overview?.pending_owner;
  const transferPendingToMe =
    !!account &&
    !!pendingOwner &&
    pendingOwner !== "0x0000000000000000000000000000000000000000" &&
    account.toLowerCase() === String(pendingOwner).toLowerCase();

  const withdrawDisabled = !!busy.withdraw || !hasClaimable || !!pending;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="My funds"
    >
      {/* Backdrop — tap to close */}
      <button
        aria-label="Close My Funds"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-panel p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-bold">My Funds</h2>
          {account && (
            <span className="font-mono text-xs text-steel" title={account}>
              {shortAddress(account)}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold transition hover:border-acid/60"
          >
            ✕ Close
          </button>
        </div>

        {!account ? (
          <div className="mt-4 rounded-2xl border border-line bg-panelInset p-4 text-sm">
            <p className="font-semibold">Wallet not connected</p>
            <p className="mt-1 text-steel">
              Connect your wallet to see your claimable balance and withdrawals.
            </p>
            <button onClick={openChooser} className="btn-primary mt-3 px-4 py-2.5 text-sm">
              Connect wallet
            </button>
          </div>
        ) : (
          <>
            {/* Claimable balance */}
            <section className="mt-4 rounded-2xl border border-line bg-panelInset p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-steel">
                Claimable balance
              </p>
              <p className="mt-1 text-2xl font-bold">{claimableGen} GEN</p>
              <p className="mt-1 text-xs text-steel">
                A release, expiry or cancel credits a claim here first — the GEN moves only when you
                withdraw it.
              </p>
              <button
                onClick={onWithdraw}
                disabled={withdrawDisabled}
                title={
                  pending
                    ? "A withdrawal is already in flight — confirm it or have the owner restore it first."
                    : undefined
                }
                className="btn-primary mt-3 px-4 py-2.5 text-sm"
              >
                {busy.withdraw ? "Withdrawing…" : `Withdraw ${claimableGen} GEN`}
              </button>
              {!hasClaimable && !pending && (
                <p className="mt-2 text-xs text-steel">
                  Nothing claimable right now — a release, expiry or cancel credits a claim here first.
                </p>
              )}
              {pending && (
                <p className="mt-2 text-xs text-steel">
                  Withdraw is disabled until the in-flight withdrawal is confirmed or restored — the
                  contract allows one pending withdrawal per address.
                </p>
              )}
            </section>

            {/* Pending withdrawal */}
            {pending && (
              <section className="mt-4 rounded-2xl border border-gold/40 bg-gold/10 p-4" role="alert">
                <p className="font-semibold">Withdrawal in flight — {pendingAmount} GEN</p>
                {pendingStarted && (
                  <p className="mt-1 text-sm text-steel">Started {pendingStarted}.</p>
                )}
                <p className="mt-2 text-sm font-semibold text-gold">
                  Only confirm if the GEN arrived in your wallet. If it never arrived, do not confirm —
                  ask the contract owner to restore the pending withdrawal instead.
                </p>
                <button
                  onClick={onConfirmWithdrawal}
                  disabled={!!busy.confirm}
                  className="btn-ghost mt-3 px-4 py-2.5 text-sm"
                >
                  {busy.confirm ? "Confirming…" : "Confirm receipt — I received the transfer"}
                </button>
              </section>
            )}

            {/* Ownership transfer waiting on this wallet */}
            {transferPendingToMe && (
              <section className="mt-4 rounded-2xl border border-gold/40 bg-gold/10 p-4">
                <p className="font-semibold">Ownership transfer waiting for you</p>
                <p className="mt-1 text-sm text-steel">
                  The owner requested a transfer to {shortAddress(pendingOwner)} — accept it on chain to
                  become the contract owner.
                </p>
                <button
                  onClick={onAcceptOwnership}
                  disabled={!!busy.accept}
                  className="btn-primary mt-3 px-4 py-2.5 text-sm"
                >
                  {busy.accept ? "Accepting…" : "Accept ownership — I am the pending owner"}
                </button>
              </section>
            )}

            {/* Owner panel */}
            {isOwner && (
              <section className="mt-4 rounded-2xl border border-line bg-panel p-4">
                <h3 className="font-display text-lg font-bold">Owner panel</h3>
                <p className="mt-1 text-sm text-steel">
                  You are the contract owner. Pause freezes new grants, funding, submissions, appeals,
                  assessments and releases — it never freezes reclaiming escrow: cancel, expiry,
                  withdraw, confirm and restore stay open while paused, so funds always remain
                  recoverable. Transferring ownership only requests the transfer — the new owner must
                  accept it on chain before ownership changes.
                </p>
                {pendingOwner &&
                  pendingOwner !== "0x0000000000000000000000000000000000000000" && (
                    <p className="mt-2 text-sm font-semibold text-gold">
                      Transfer requested → {shortAddress(pendingOwner)} — waiting for the new owner to
                      accept. You can request a different address, which replaces the pending one.
                    </p>
                  )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onPause(!isPaused)}
                    disabled={!!busy.pause}
                    className="rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy.pause ? "Working…" : isPaused ? "Resume protocol" : "Pause protocol"}
                  </button>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-semibold">Transfer ownership</label>
                  <span className="mt-1 inline-flex w-full flex-wrap items-center gap-2">
                    <input
                      value={transferAddr}
                      onChange={(e) => setTransferAddr(e.target.value)}
                      placeholder="New owner 0x…"
                      className="glass-input w-full rounded-xl px-3 py-2.5 font-mono text-sm sm:w-64"
                    />
                    <button
                      onClick={() => transferAddr.trim() && onTransferOwnership(transferAddr)}
                      disabled={!!busy.transfer || !transferAddr.trim()}
                      className="btn-ghost px-4 py-2.5 text-sm"
                    >
                      {busy.transfer ? "Working…" : "Transfer ownership"}
                    </button>
                  </span>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-semibold">Restore a pending withdrawal</label>
                  <p className="mt-0.5 text-xs text-steel">
                    Only when the recipient did not receive the transfer (at least 10 minutes after it
                    started). Restoring makes the amount claimable again.
                  </p>
                  <span className="mt-1 inline-flex w-full flex-wrap items-center gap-2">
                    <input
                      value={restoreAddr}
                      onChange={(e) => setRestoreAddr(e.target.value)}
                      placeholder="Recipient 0x…"
                      className="glass-input w-full rounded-xl px-3 py-2.5 font-mono text-sm sm:w-64"
                    />
                    <button
                      onClick={() => restoreAddr.trim() && onRestorePending(restoreAddr)}
                      disabled={!!busy.restore || !restoreAddr.trim()}
                      className="btn-ghost px-4 py-2.5 text-sm"
                    >
                      {busy.restore ? "Working…" : "Restore pending"}
                    </button>
                  </span>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-semibold">Sweep excess funds</label>
                  <p className="mt-0.5 text-xs text-steel">
                    Sends any GEN above locked escrow + claimable + pending to the owner. Only
                    enabled when there is excess to sweep.
                  </p>
                  <button
                    onClick={() => onSweep()}
                    disabled={!!busy.sweep}
                    className="btn-ghost mt-1 px-4 py-2.5 text-sm"
                  >
                    {busy.sweep ? "Working…" : "Sweep excess"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
