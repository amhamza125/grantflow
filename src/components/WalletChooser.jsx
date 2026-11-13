// Wallet chooser — a phone-first sheet offering a CHOICE, never a single
// path: injected wallets found on this device (EIP-6963 + legacy fallback),
// WalletConnect (QR / deep links), and the MetaMask deep link as one option
// among others. If no wallet is installed at all, the sheet shows the
// options instead of a dead end. A tap that hangs shows "Connecting…" and,
// after 8 seconds, an "Open in external browser" fallback.
import React, { useEffect, useRef, useState } from "react";
import { friendlyError } from "../lib/genlayer.js";
import {
  METAMASK_DEEP_LINK,
  connectInjected,
  connectWalletConnect,
  discoverInjectedWallets,
  disconnectWalletConnect,
  walletConnectAvailable,
  wcDeepLinks,
} from "../lib/wallet.js";

export default function WalletChooser({ onClose, onConnected, onError }) {
  const [injected, setInjected] = useState(null); // null = still discovering
  const [phase, setPhase] = useState("choose"); // choose | connecting | wc
  const [connectingName, setConnectingName] = useState("");
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false); // connect taking > 8s: show the fallback
  const [wcUri, setWcUri] = useState("");
  const [wcQr, setWcQr] = useState("");
  const [copied, setCopied] = useState(false);
  const slowTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    discoverInjectedWallets().then((list) => {
      if (alive) setInjected(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      // Leaving mid-WalletConnect: drop the pending session so it cannot
      // connect behind the user's back.
      disconnectWalletConnect();
    };
  }, []);

  const startSlowTimer = () => {
    setSlow(false);
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSlow(true), 8000);
  };
  const stopSlowTimer = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    setSlow(false);
  };

  const fail = (e) => {
    stopSlowTimer();
    const msg = friendlyError(e);
    setError(msg);
    setPhase("choose");
    if (onError) onError(msg);
  };

  const connectOne = async (wallet) => {
    setError("");
    setConnectingName(wallet.name);
    setPhase("connecting");
    startSlowTimer();
    try {
      const acc = await Promise.race([
        connectInjected(wallet.provider),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "The wallet did not respond. If you are inside a wallet app, try again; otherwise pick another option below."
                )
              ),
            25000
          )
        ),
      ]);
      stopSlowTimer();
      onConnected(acc, {
        provider: wallet.provider,
        providerId: wallet.id,
        providerName: wallet.name,
      });
    } catch (e) {
      fail(e);
    }
  };

  const connectWC = async () => {
    setError("");
    setWcUri("");
    setWcQr("");
    setPhase("wc");
    startSlowTimer();
    try {
      const acc = await connectWalletConnect(async (uri) => {
        setWcUri(uri);
        try {
          const { default: QRCode } = await import("qrcode");
          setWcQr(await QRCode.toDataURL(uri, { width: 220, margin: 1 }));
        } catch {
          // QR render failed — the deep links and copyable URI below still work.
        }
      });
      stopSlowTimer();
      onConnected(acc, { providerName: "WalletConnect", providerId: "walletconnect" });
    } catch (e) {
      fail(e);
    }
  };

  const copyWcUri = async () => {
    try {
      await navigator.clipboard.writeText(wcUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const wcReady = walletConnectAvailable();
  const links = wcUri ? wcDeepLinks(wcUri) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-card dark:bg-[#15171c] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Connect a wallet</h2>
            <p className="mt-0.5 text-sm text-steel">
              Reading grants works without a wallet — only creating, funding and claiming need one.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close wallet chooser"
            className="ml-auto rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose/40 bg-rose/10 p-3 text-sm font-semibold text-rose">
            {error}
          </p>
        )}

        {phase === "connecting" && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm">
            <p className="font-semibold">Connecting to {connectingName}…</p>
            <p className="mt-1 text-steel">Approve the request in your wallet. If nothing appears, your wallet may be locked.</p>
            {slow && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={METAMASK_DEEP_LINK} target="_blank" rel="noreferrer" className="btn-primary px-4 py-2.5 text-sm">
                  Open in external browser
                </a>
                <button onClick={() => { stopSlowTimer(); setPhase("choose"); }} className="btn-ghost px-4 py-2.5 text-sm">
                  Try another wallet
                </button>
              </div>
            )}
          </div>
        )}

        {phase === "wc" && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm">
            <p className="font-semibold">WalletConnect — approve in your wallet</p>
            {wcQr ? (
              <img src={wcQr} alt="WalletConnect QR code — scan with your wallet app" className="mx-auto mt-3 h-44 w-44 rounded-xl border border-line bg-white p-2" />
            ) : (
              <p className="mt-2 text-steel">Generating the connection code…</p>
            )}
            {wcUri && (
              <>
                <p className="mt-3 font-semibold">On your phone, open it in your wallet:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <a key={l.name} href={l.href} className="btn-ghost px-3 py-2 text-xs">
                      Open in {l.name}
                    </a>
                  ))}
                </div>
                <button onClick={copyWcUri} className="mt-3 text-xs font-semibold text-acid hover:underline">
                  {copied ? "✓ Connection link copied" : "Copy connection link"}
                </button>
              </>
            )}
            <p className="mt-3 text-steel">Waiting for approval in your wallet…</p>
            {slow && (
              <div className="mt-3">
                <a href={METAMASK_DEEP_LINK} target="_blank" rel="noreferrer" className="btn-primary px-4 py-2.5 text-sm">
                  Open in external browser
                </a>
              </div>
            )}
            <button onClick={() => { stopSlowTimer(); setPhase("choose"); }} className="btn-ghost mt-3 px-4 py-2.5 text-sm">
              Cancel
            </button>
          </div>
        )}

        {phase === "choose" && (
          <>
            <h3 className="mt-4 text-sm font-bold uppercase tracking-widest text-steel">Wallets on this device</h3>
            {injected === null ? (
              <p className="mt-2 text-sm text-steel">Looking for wallets…</p>
            ) : injected.length === 0 ? (
              <p className="mt-2 text-sm text-steel">
                No wallet found in this browser. WalletConnect below works without one — or open this page
                inside a wallet app.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {injected.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => connectOne(w)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm font-semibold transition hover:border-acid/60"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint/15 font-display text-sm font-bold text-mint">
                      {w.name.slice(0, 1)}
                    </span>
                    {w.name}
                    <span className="ml-auto text-xs font-normal text-steel">Injected</span>
                  </button>
                ))}
              </div>
            )}

            <h3 className="mt-5 text-sm font-bold uppercase tracking-widest text-steel">WalletConnect</h3>
            {wcReady ? (
              <button
                onClick={connectWC}
                className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm font-semibold transition hover:border-acid/60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan/15 font-display text-sm font-bold text-cyan">
                  W
                </span>
                WalletConnect — scan QR or open in your wallet
                <span className="ml-auto text-xs font-normal text-steel">QR / deep link</span>
              </button>
            ) : (
              <div className="mt-2 rounded-2xl border border-line bg-panel p-3 text-sm">
                <p className="font-semibold">WalletConnect is not set up yet</p>
                <p className="mt-1 text-steel">
                  This site needs a free Reown Cloud project ID to offer WalletConnect. Injected wallets
                  above still work, and Coinbase Wallet can connect once WalletConnect is set up.
                </p>
              </div>
            )}

            <h3 className="mt-5 text-sm font-bold uppercase tracking-widest text-steel">No wallet installed?</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={METAMASK_DEEP_LINK} target="_blank" rel="noreferrer" className="btn-primary px-4 py-2.5 text-sm">
                Open in MetaMask
              </a>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className="btn-ghost px-4 py-2.5 text-sm"
              >
                Install a wallet
              </a>
            </div>
            <p className="mt-3 text-xs text-steel">
              Your wallet switches to GenLayer Bradbury (chain 4221) when you connect. Nothing is signed
              until you approve an action.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
