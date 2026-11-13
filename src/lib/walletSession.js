// Persisted wallet session — the fix for the filmed connect wipe.
//
// The old code kept the account in in-memory React state only, and a
// `chainChanged → location.reload()` listener (armed by the connect flow's
// own chain switch) wiped it a second after connect. The header then read
// "Connect wallet" forever, because nothing ever restored the session.
//
// This module owns the session lifecycle:
//   * save on every successful connect (account + provider identity);
//   * restore on mount via eth_accounts — silent, no prompt; if the wallet
//     no longer authorises the account, the session is dropped;
//   * chainChanged updates state (the caller re-reads the chain) — it NEVER
//     reloads the page;
//   * accountsChanged never wipes on a bare empty array: an empty emission
//     is re-checked with eth_accounts first (OKX emits one transiently
//     around the chain switch). Only a confirmed-empty account list clears
//     the session.
import { discoverInjectedWallets, getWcProvider } from "./wallet.js";
import { setWalletProvider, walletProvider } from "./genlayer.js";
import { CHAIN_ID_HEX } from "./config.js";

const SESSION_KEY = "grantflow-wallet-session";

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.account) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the in-memory session still works for this visit.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

/** Resolve the provider object for a saved session (by EIP-6963 id, else legacy). */
async function resolveProvider(session) {
  // WalletConnect sessions restore through the SDK, not discovery.
  if (session.providerId === "walletconnect") return getWcProvider();
  try {
    const wallets = await discoverInjectedWallets(700);
    const match = wallets.find((w) => w.id === session.providerId);
    if (match) return match.provider;
  } catch {}
  if (session.providerId === "legacy-ethereum" && typeof window !== "undefined") {
    return window.ethereum || null;
  }
  return null;
}

/**
 * Restore a saved session silently. Returns { account, provider, providerName }
 * when the wallet still authorises the saved account, else null (session dropped).
 * Never prompts the user and never throws.
 */
export async function restoreSession() {
  const session = loadSession();
  if (!session) return null;
  try {
    const provider = await resolveProvider(session);
    if (!provider || typeof provider.request !== "function") {
      clearSession();
      return null;
    }
    setWalletProvider(provider);
    const accounts = await provider.request({ method: "eth_accounts" });
    const account = Array.isArray(accounts) && accounts[0] ? accounts[0] : "";
    if (!account || account.toLowerCase() !== String(session.account).toLowerCase()) {
      clearSession();
      return null;
    }
    // Make sure we are on Bradbury; a wrong chain is a notice, not a failure.
    let chainId = null;
    try {
      chainId = await provider.request({ method: "eth_chainId" });
    } catch {}
    return { account, provider, providerName: session.providerName || "Wallet", chainId };
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Attach guarded listeners to a provider. Returns a cleanup function.
 * - accountsChanged: non-empty → onAccounts(account). Empty → re-check
 *   eth_accounts after 600ms; only call onDisconnect when the re-check is
 *   still empty (a genuine lock/disconnect, not a transient emission).
 * - chainChanged: calls onChain(chainIdHex). NEVER reloads.
 */
export function attachGuardedListeners(provider, { onAccounts, onChain, onDisconnect }) {
  if (!provider || typeof provider.on !== "function") return () => {};
  let dead = false;
  let recheckTimer = null;
  const handleAccounts = (accs) => {
    if (dead) return;
    const next = Array.isArray(accs) && accs[0] ? accs[0] : "";
    if (next) {
      if (recheckTimer) clearTimeout(recheckTimer);
      onAccounts(next);
      return;
    }
    // Empty array: could be a lock, a disconnect, or a transient emission
    // around a chain switch. Re-check before wiping anything.
    if (recheckTimer) clearTimeout(recheckTimer);
    recheckTimer = setTimeout(async () => {
      if (dead) return;
      try {
        const current = await provider.request({ method: "eth_accounts" });
        const confirmed = Array.isArray(current) && current[0] ? current[0] : "";
        if (confirmed) onAccounts(confirmed);
        else onDisconnect();
      } catch {
        onDisconnect();
      }
    }, 600);
  };
  const handleChain = (chainId) => {
    if (dead) return;
    onChain(chainId);
  };
  try {
    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);
  } catch {}
  return () => {
    dead = true;
    if (recheckTimer) clearTimeout(recheckTimer);
    try {
      provider.removeListener("accountsChanged", handleAccounts);
      provider.removeListener("chainChanged", handleChain);
    } catch {}
  };
}

/** The chain the provider reports, as a hex string — "" when unknown. */
export async function readChainId(provider) {
  const eth = provider || walletProvider();
  if (!eth || typeof eth.request !== "function") return "";
  try {
    const id = await eth.request({ method: "eth_chainId" });
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

export function isBradburyChain(chainIdHex) {
  return String(chainIdHex || "").toLowerCase() === CHAIN_ID_HEX.toLowerCase();
}
