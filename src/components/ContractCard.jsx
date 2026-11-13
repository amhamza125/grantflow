// Contract card — the contract address switcher.
//
// The dApp reads from and writes to ONE active contract: the official
// GrantFlow v3.4 by default, or a custom contract the user switched to this
// session after it passed the probe (get_protocol_overview answers as a
// GrantFlow contract — see lib/contract.js). A custom contract is
// session-only: it never reaches localStorage, never comes from a URL
// param, and the header pill + amber banner always say which contract is
// active. One tap returns to the official contract.
import React, { useState } from "react";
import { useApp } from "../lib/store.jsx";
import {
  getRecentContracts,
  readinessFromOverview,
} from "../lib/contract.js";
import { shortAddress } from "../lib/genlayer.js";

export default function ContractCard() {
  const {
    activeContract,
    OFFICIAL_CONTRACT_ADDRESS,
    isCustomContract,
    customInfo,
    switchContract,
    resetContract,
    reloadContractState,
    switchBusy,
    contractSwitcherOpen,
    setContractSwitcherOpen,
    explorerAddressUrl,
  } = useApp();

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recents, setRecents] = useState(() => getRecentContracts());

  const readiness = isCustomContract && customInfo ? readinessFromOverview(customInfo) : null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(activeContract);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the address is still visible to copy by hand.
    }
  };

  const trySwitch = async (addr) => {
    setError("");
    const res = await switchContract(addr);
    setRecents(getRecentContracts());
    if (!res?.ok) {
      setError(res?.error || "That contract could not be used.");
    } else {
      setInput("");
    }
  };

  return (
    <section id="contract-card" aria-label="Contract" className="mt-4 rounded-2xl border border-line bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">Contract</h2>
        {isCustomContract ? (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold ring-1 ring-inset ring-line">
            CUSTOM CONTRACT
          </span>
        ) : (
          <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-bold text-mint ring-1 ring-inset ring-line">
            OFFICIAL CONTRACT v3.4
          </span>
        )}
        <button
          onClick={reloadContractState}
          className="ml-auto rounded-full bg-panelStrong px-3 py-1.5 text-xs font-bold text-acid ring-1 ring-inset ring-line hover:underline"
          title="Re-read grants, overview and the explorer tx list from the chain"
        >
          Reload Contract State
        </button>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="break-all font-mono text-xs font-semibold" title={activeContract}>
          {shortAddress(activeContract)}
        </span>
        <button onClick={copyAddress} className="text-xs font-bold text-acid hover:underline">
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <a
          className="text-xs font-semibold text-acid hover:underline"
          href={explorerAddressUrl(activeContract)}
          target="_blank"
          rel="noreferrer"
        >
          View on Explorer ↗
        </a>
      </p>

      {isCustomContract ? (
        <p className="mt-1 text-xs leading-relaxed text-steel">
          You are testing a custom contract. This is not the official GrantFlow v3.4 — grants
          here are separate, and every write goes to this contract only.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-steel">
          The official GrantFlow v3.4 contract — this is where the real grants live.
        </p>
      )}

      {/* Readiness strip — from the probe overview, never guessed. */}
      {isCustomContract && readiness && (
        <div className="mt-2 rounded-xl border border-line bg-panelStrong px-3 py-2 text-xs leading-relaxed">
          <p className="font-bold">Readiness</p>
          <p className="mt-1">
            ✓ Schema compatible · ✓ Owner {shortAddress(readiness.owner || "")} · ✓{" "}
            {readiness.grantCount} grant{readiness.grantCount === 1 ? "" : "s"} found
            {readiness.version === "v3.4" ? " · v3.4" : " · older GrantFlow"}
          </p>
          <p className="mt-1 text-steel">
            {readiness.paused
              ? "This contract is PAUSED — creates and writes are refused until its owner resumes it."
              : "Create Grant is unlocked on this contract."}
          </p>
        </div>
      )}

      {isCustomContract && (
        <button
          onClick={resetContract}
          className="mt-2 rounded-full bg-mint/15 px-3 py-1.5 text-xs font-bold text-mint ring-1 ring-inset ring-line hover:underline"
        >
          Back to official v3.4
        </button>
      )}

      {/* Disclosure — the input stays hidden until the user asks for it. */}
      <div className="mt-3 border-t border-line pt-3">
        <button
          onClick={() => setContractSwitcherOpen((o) => !o)}
          aria-expanded={contractSwitcherOpen}
          className="text-sm font-bold text-acid hover:underline"
        >
          {contractSwitcherOpen ? "▾ Hide contract switcher" : "▸ Switch / Test a Custom Contract"}
        </button>
        {contractSwitcherOpen && (
          <div className="mt-2">
            <p className="text-xs leading-relaxed text-steel">
              Paste a contract address to test it on this dApp. It is checked first — the
              address must answer as a GrantFlow contract — and it lasts only for this
              session. Nothing is auto-switched, and the official contract is one tap away.
            </p>
            <form
              className="mt-2 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                trySwitch(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="0x… contract address"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl border border-line bg-panelStrong px-3 py-2 font-mono text-xs outline-none focus:border-acid"
              />
              <button
                type="submit"
                disabled={switchBusy || !input.trim()}
                className="shrink-0 rounded-xl bg-acid px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {switchBusy ? "Checking…" : "Use this contract"}
              </button>
            </form>
            {error && (
              <p role="alert" className="mt-2 rounded-xl border border-rose/40 bg-rose/10 px-3 py-2 text-xs leading-relaxed text-rose">
                {error}
              </p>
            )}
            {recents.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-bold text-steel">Recent contracts (this session only)</p>
                <ul className="mt-1 space-y-1">
                  {recents.map((a) => (
                    <li key={a}>
                      <button
                        onClick={() => trySwitch(a)}
                        disabled={switchBusy}
                        className="font-mono text-xs font-semibold text-acid hover:underline disabled:opacity-50"
                      >
                        {shortAddress(a)}
                        {a.toLowerCase() === activeContract.toLowerCase() ? " · in use" : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-steel">
              Only GrantFlow contracts pass the check — any other address is rejected and
              nothing changes. The official contract is {shortAddress(OFFICIAL_CONTRACT_ADDRESS)}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
