import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  explorerAddressUrl,
  explorerTxUrl,
} from "./lib/config.js";
import {
  connectWallet,
  readJsonView,
  sendWrite,
  payoutFees,
  baseFees,
  ethBalance,
  balanceDelta,
  shortAddress,
  genToWei,
  weiToGen,
  friendlyError,
} from "./lib/genlayer.js";
import GrantFile from "./components/GrantFile.jsx";
import CreateGrant from "./components/CreateGrant.jsx";
import Ledger from "./components/Ledger.jsx";

const GEN = 10n ** 18n;

export default function App() {
  const [view, setView] = useState("flow"); // "flow" | "ledger"
  const [account, setAccount] = useState("");
  const [overview, setOverview] = useState(null);
  const [grants, setGrants] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selectedId, setSelectedId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState({}); // key -> label
  const [toasts, setToasts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const pushToast = useCallback((kind, title, body, txHash) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, title, body, txHash }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 14000);
  }, []);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const ov = await readJsonView("get_protocol_overview", []);
      setOverview(ov);
      const count = ov ? Number(ov.grant_count || 0) : 0;
      const list = [];
      for (let i = 0; i < count; i++) {
        const g = await readJsonView("get_grant", [i]);
        if (g) list.push(g);
      }
      setGrants(list);
      const hist = await readJsonView("get_activity_history", [50]);
      setActivity(Array.isArray(hist) ? hist : []);
    } catch (e) {
      setLoadError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshTick]);

  // Keep the connected account in sync if the user switches in the wallet.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth || !eth.on) return;
    const onAccounts = (accs) => setAccount(accs && accs[0] ? accs[0] : "");
    const onChain = () => window.location.reload();
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, []);

  const selected = useMemo(
    () => grants.find((g) => Number(g.id) === Number(selectedId)) || grants[0] || null,
    [grants, selectedId]
  );

  const needWallet = () => {
    if (!account) {
      pushToast("error", "Wallet not connected", "Connect your wallet first — every write is signed by you, in your browser.");
      return false;
    }
    return true;
  };

  const runWrite = useCallback(
    async (key, label, fn) => {
      if (busy[key]) return;
      setBusy((b) => ({ ...b, [key]: label }));
      try {
        const res = await fn();
        setRefreshTick((t) => t + 1);
        return res;
      } catch (e) {
        pushToast("error", `${label} failed`, friendlyError(e));
        return null;
      } finally {
        setBusy((b) => {
          const n = { ...b };
          delete n[key];
          return n;
        });
      }
    },
    [busy, pushToast]
  );

  const onConnect = async () => {
    try {
      const acc = await connectWallet();
      setAccount(acc);
      pushToast("ok", "Wallet connected", `${shortAddress(acc)} — connected to Bradbury (chain 4221).`);
    } catch (e) {
      pushToast("error", "Wallet connection failed", friendlyError(e));
    }
  };

  // --- GrantFlow actions (every one is a real contract call) --------------
  const onCreate = async ({ builder, title, milestones }) => {
    if (!needWallet()) return;
    const milestonesJson = JSON.stringify(
      milestones.map((m) => ({ spec: m.spec, amount_wei: genToWei(m.amountGen).toString() }))
    );
    await runWrite("create", "Create grant", async () => {
      const { hash, receipt } = await sendWrite(
        account,
        "create_grant",
        [builder.trim().toLowerCase(), title.trim(), milestonesJson],
        0n,
        baseFees()
      );
      pushToast(
        "ok",
        "Grant created",
        `create_grant is ${receipt ? receipt.statusName || receipt.status_name || receipt.status : "submitted"} — grant will appear in the file once the chain confirms it.`,
        hash
      );
      setShowCreate(false);
    });
  };

  const onFund = async (grant) => {
    if (!needWallet()) return;
    const totalWei = BigInt(grant.total_escrow_wei);
    await runWrite(`fund-${grant.id}`, "Fund grant", async () => {
      const before = await ethBalance(account);
      const { hash, receipt } = await sendWrite(
        account,
        "fund_grant",
        [Number(grant.id)],
        totalWei,
        await payoutFees(account) // fund can refund (wrong amount / wrong sender), so it carries the payout allocation
      );
      const d = await balanceDelta(account, before);
      const refunded = receipt && receipt.execName === "FINISHED_WITH_ERROR";
      pushToast(
        refunded ? "warn" : "ok",
        refunded ? "Funding rejected — refunded in full" : "Grant funded",
        refunded
          ? `The contract refused the funding and sent the GEN back. Your balance change is ${weiToGen(d.deltaWei)} GEN (transaction fees only).`
          : `${weiToGen(totalWei)} GEN escrow locked. Your balance change: ${weiToGen(d.deltaWei)} GEN.`,
        hash
      );
    });
  };

  const onSubmitEvidence = async (grant, summary, links) => {
    if (!needWallet()) return;
    const evidenceJson = JSON.stringify({ summary: summary.trim(), links });
    await runWrite(`evidence-${grant.id}`, "Submit evidence", async () => {
      const { hash, receipt } = await sendWrite(
        account,
        "submit_evidence",
        [Number(grant.id), evidenceJson],
        0n,
        baseFees()
      );
      pushToast(
        "ok",
        "Evidence submitted",
        `submit_evidence is ${receipt ? receipt.statusName || receipt.status_name || receipt.status : "submitted"} — the milestone now awaits jury assessment.`,
        hash
      );
    });
  };

  const onAssess = async (grant) => {
    if (!needWallet()) return;
    await runWrite(`assess-${grant.id}`, "Assess milestone", async () => {
      pushToast(
        "info",
        "Jury assessment started",
        "The contract fetches the linked evidence itself and the validator jury judges the fetched content. This can take several minutes — the verdict appears in the file when consensus finalizes."
      );
      const { hash, receipt } = await sendWrite(
        account,
        "assess_milestone",
        [Number(grant.id)],
        0n,
        baseFees()
      );
      const exec = receipt ? receipt.execName || "" : "";
      pushToast(
        exec === "FINISHED_WITH_ERROR" ? "warn" : "ok",
        exec === "FINISHED_WITH_ERROR" ? "Assessment could not run" : "Assessment complete",
        exec === "FINISHED_WITH_ERROR"
          ? "The jury could not assess this milestone (evidence missing or unreachable, or wrong state). No funds moved — the milestone stays open for resubmission."
          : "The jury has returned a verdict. Open the milestone below to read it with its grounding receipt.",
        hash
      );
    });
  };

  const onRelease = async (grant) => {
    if (!needWallet()) return;
    const milestone = grant.milestones[Number(grant.current_milestone)];
    const amountWei = BigInt(milestone.amount_wei);
    await runWrite(`release-${grant.id}`, "Release tranche", async () => {
      const before = await ethBalance(grant.builder);
      const { hash, receipt } = await sendWrite(
        account,
        "release_tranche",
        [Number(grant.id)],
        0n,
        await payoutFees(grant.builder) // Twin14 allocation to the builder
      );
      const d = await balanceDelta(grant.builder, before);
      const expected = amountWei;
      const landed = d.deltaWei === expected;
      pushToast(
        landed ? "ok" : "warn",
        landed ? "Tranche released — payout verified" : "Release submitted — payout NOT verified",
        landed
          ? `Builder balance rose by exactly ${weiToGen(d.deltaWei)} GEN. Receipt alone proves nothing; the balance delta does.`
          : `The receipt execution is ${receipt ? receipt.execName || "unknown" : "unknown"}, but the builder balance moved by ${weiToGen(d.deltaWei)} GEN instead of the expected ${weiToGen(expected)} GEN. Check the transaction in the explorer.`,
        hash
      );
    });
  };

  const onCancel = async (grant) => {
    if (!needWallet()) return;
    const unclaimed = BigInt(grant.total_escrow_wei) - BigInt(grant.released_wei);
    await runWrite(`cancel-${grant.id}`, "Cancel grant", async () => {
      const before = await ethBalance(grant.grantor);
      const { hash } = await sendWrite(
        account,
        "cancel_grant",
        [Number(grant.id)],
        0n,
        await payoutFees(grant.grantor) // cancel refunds unclaimed escrow to the grantor
      );
      const d = await balanceDelta(grant.grantor, before);
      pushToast(
        "ok",
        "Grant cancelled",
        unclaimed > 0n
          ? `Unclaimed escrow returns to the grantor. Grantor balance change: ${weiToGen(d.deltaWei)} GEN (expected about +${weiToGen(unclaimed)} GEN minus transaction fees).`
          : "Grant cancelled. There was no unclaimed escrow to refund.",
        hash
      );
    });
  };

  const onPause = async (paused) => {
    if (!needWallet()) return;
    await runWrite("pause", paused ? "Pause protocol" : "Resume protocol", async () => {
      const { hash } = await sendWrite(account, "set_paused", [paused], 0n, baseFees());
      pushToast("ok", paused ? "Protocol paused" : "Protocol resumed", "set_paused confirmed on chain.", hash);
    });
  };

  const onTransferOwnership = async (newOwner) => {
    if (!needWallet()) return;
    await runWrite("transfer", "Transfer ownership", async () => {
      const { hash } = await sendWrite(account, "transfer_ownership", [newOwner.trim().toLowerCase()], 0n, baseFees());
      pushToast("ok", "Ownership transferred", `New owner: ${shortAddress(newOwner)}.`, hash);
    });
  };

  const isOwner = account && overview && account.toLowerCase() === String(overview.owner || "").toLowerCase();

  return (
    <div className="min-h-screen bg-paper font-body text-ink">
      {/* Header */}
      <header className="border-b-2 border-ink bg-paper2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="mr-2">
            <h1 className="font-display text-3xl font-bold leading-none">GrantFlow</h1>
            <p className="mt-1 text-xs tracking-wide text-inksoft">
              AI-jury grant payouts · GenLayer Bradbury · GMV v2.2
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-rule bg-paper px-3 py-1 text-xs font-semibold">
              Bradbury · chain 4221 · GEN
            </span>
            <a
              href={explorerAddressUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-rule bg-paper px-3 py-1 font-mono text-xs hover:underline"
              title={CONTRACT_ADDRESS}
            >
              {shortAddress(CONTRACT_ADDRESS)} ↗
            </a>
            {account ? (
              <span className="rounded-full bg-pine px-3 py-1 text-xs font-semibold text-white" title={account}>
                {shortAddress(account)}
              </span>
            ) : (
              <button
                onClick={onConnect}
                className="rounded-full bg-pine px-4 py-1.5 text-xs font-semibold text-white hover:bg-pinebright"
              >
                Connect wallet
              </button>
            )}
          </div>
        </div>
        {/* Protocol strip — every number from chain */}
        <div className="border-t border-rule">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-1 px-4 py-2 text-sm">
            <span>
              Grants: <strong>{overview ? overview.grant_count : "…"}</strong>
            </span>
            <span>
              Assessed: <strong>{overview ? overview.total_assessed : "…"}</strong>
            </span>
            <span>
              Escrow held:{" "}
              <strong>{overview ? `${weiToGen(overview.contract_balance_wei)} GEN` : "…"}</strong>
            </span>
            <span>
              Owner:{" "}
              <strong>{overview ? shortAddress(overview.owner) : "…"}</strong>
            </span>
            <span>
              Status:{" "}
              <strong>{overview ? (overview.paused ? "Paused" : "Live") : "…"}</strong>
            </span>
            <button onClick={() => setRefreshTick((t) => t + 1)} className="ml-auto text-xs font-semibold text-pine underline">
              Refresh from chain
            </button>
          </div>
        </div>
      </header>

      {/* View tabs */}
      <nav className="mx-auto flex max-w-6xl gap-2 px-4 pt-4">
        <button
          onClick={() => setView("flow")}
          className={`rounded-t-lg border border-b-0 px-5 py-2 text-sm font-semibold ${
            view === "flow" ? "border-ink bg-paper2" : "border-rule bg-paper text-inksoft"
          }`}
        >
          GrantFlow — work the grants
        </button>
        <button
          onClick={() => setView("ledger")}
          className={`rounded-t-lg border border-b-0 px-5 py-2 text-sm font-semibold ${
            view === "ledger" ? "border-ink bg-paper2" : "border-rule bg-paper text-inksoft"
          }`}
        >
          Public Ledger — every verdict
        </button>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {loading ? (
          <div className="rounded-lg border border-rule bg-paper2 p-8 text-center shadow-file">
            <p className="font-display text-xl">Reading the chain…</p>
            <p className="mt-2 text-sm text-inksoft">
              Fetching the protocol overview and every grant from GMV v2.2 on Bradbury.
            </p>
          </div>
        ) : loadError && grants.length === 0 ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-8 shadow-file">
            <p className="font-display text-xl">Could not read the contract</p>
            <p className="mt-2 text-sm">{loadError}</p>
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              className="mt-4 rounded bg-pine px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : view === "flow" ? (
          <div className="rounded-b-lg rounded-tr-lg border border-ink bg-paper2 p-4 shadow-file sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-bold">Grant files</h2>
              <button
                onClick={() => setShowCreate((s) => !s)}
                className="ml-auto rounded bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pinebright"
              >
                {showCreate ? "Close form" : "+ New grant"}
              </button>
            </div>
            {showCreate && (
              <CreateGrant onCreate={onCreate} busy={!!busy.create} account={account} onConnect={onConnect} />
            )}

            {/* Grant selector — the file tabs */}
            <div className="mt-4 flex flex-wrap gap-2">
              {grants.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(Number(g.id))}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    selected && Number(selected.id) === Number(g.id)
                      ? "border-pine bg-green-50 font-semibold"
                      : "border-rule bg-paper hover:border-pine"
                  }`}
                >
                  <span className="block font-mono text-xs text-inksoft">#{g.id} · {g.status}</span>
                  <span className="block max-w-56 truncate">{g.title}</span>
                </button>
              ))}
              {grants.length === 0 && (
                <p className="text-sm text-inksoft">
                  No grants yet on this contract. Create the first one — you are the grantor, and you fund it.
                </p>
              )}
            </div>

            {selected && (
              <GrantFile
                grant={selected}
                account={account}
                isOwner={!!isOwner}
                busy={busy}
                onFund={onFund}
                onSubmitEvidence={onSubmitEvidence}
                onAssess={onAssess}
                onRelease={onRelease}
                onCancel={onCancel}
                onConnect={onConnect}
              />
            )}

            {/* Owner panel — only the contract owner sees it */}
            {isOwner && (
              <section className="mt-6 rounded-lg border border-rule bg-paper p-4">
                <h3 className="font-display text-lg font-bold">Owner panel</h3>
                <p className="text-sm text-inksoft">
                  You are the contract owner. These call set_paused and transfer_ownership on the contract.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onPause(!overview.paused)}
                    disabled={!!busy.pause}
                    className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy.pause ? "Working…" : overview.paused ? "Resume protocol" : "Pause protocol"}
                  </button>
                  <OwnerTransfer onTransfer={onTransferOwnership} busy={!!busy.transfer} />
                </div>
              </section>
            )}

            {/* Activity — verdict history underneath the file */}
            <section className="mt-6">
              <h3 className="font-display text-lg font-bold">Activity — what the contract recorded</h3>
              {activity.length === 0 ? (
                <p className="mt-1 text-sm text-inksoft">No activity recorded yet.</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {[...activity].reverse().map((a, i) => (
                    <li key={i} className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm">
                      <span className="font-mono text-xs font-semibold text-pine">{a.type || "EVENT"}</span>
                      <span className="ml-2 break-words">{a.message || JSON.stringify(a)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        ) : (
          <div className="rounded-b-lg rounded-tr-lg border border-ink bg-paper2 p-4 shadow-file sm:p-6">
            <Ledger grants={grants} />
          </div>
        )}

        <footer className="mt-8 border-t border-rule pt-4 text-xs text-inksoft">
          <p>
            Contract GMV v2.2 —{" "}
            <a className="font-mono underline" href={explorerAddressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>{" "}
            on Bradbury (chain 4221). Every number on this page is read live from that contract; every button
            sends a real transaction signed by your wallet. Payouts are proven by the recipient&apos;s balance
            change, not by the receipt alone. Explorer:{" "}
            <a className="underline" href={EXPLORER_URL} target="_blank" rel="noreferrer">
              {EXPLORER_URL}
            </a>
          </p>
        </footer>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border p-3 text-sm shadow-file ${
              t.kind === "error"
                ? "border-red-300 bg-red-50"
                : t.kind === "warn"
                  ? "border-amber-300 bg-amber-50"
                  : t.kind === "info"
                    ? "border-sky-300 bg-sky-50"
                    : "border-green-300 bg-green-50"
            }`}
          >
            <p className="font-semibold">{t.title}</p>
            <p className="mt-1 break-words">{t.body}</p>
            {t.txHash && (
              <a
                href={explorerTxUrl(t.txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block font-mono text-xs underline"
              >
                {shortAddress(t.txHash)} ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OwnerTransfer({ onTransfer, busy }) {
  const [addr, setAddr] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        placeholder="New owner 0x…"
        className="w-64 rounded border border-rule bg-paper2 px-3 py-2 font-mono text-sm"
      />
      <button
        onClick={() => addr.trim() && onTransfer(addr)}
        disabled={busy || !addr.trim()}
        className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "Transfer ownership"}
      </button>
    </span>
  );
}
