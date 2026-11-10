// GrantFlow dApp — grant files + public ledger, read live from the
// GrantFlow v3.3 contract on Bradbury (chain 4221). No wallet is needed to
// read: every number and verdict comes from get_protocol_overview /
// get_grant / get_activity_history. Writes (fund, submit, assess, release,
// appeal, expire, cancel, withdraw) are signed by the connected wallet.
//
// The claim flow: a release, expiry or cancel only credits a claim — the
// GEN moves when the recipient withdraws it, and only a balance delta
// proves the transfer landed. withdraw_claim is the only method that pays
// inline.
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
  getClaimable,
  getPending,
  shortAddress,
  genToWei,
  weiToGen,
  friendlyError,
} from "./lib/genlayer.js";
import GrantFile from "./components/GrantFile.jsx";
import CreateGrant from "./components/CreateGrant.jsx";
import Ledger from "./components/Ledger.jsx";
import RiskHeatmap from "./components/RiskHeatmap.jsx";
import { buildReputation } from "./lib/reputation.js";
import { LoadingView } from "./components/Skeletons.jsx";
import { initialTheme, applyTheme, toggleTheme } from "./lib/theme.js";

const GEN = 10n ** 18n;

export default function App() {
  const [view, setView] = useState("flow"); // "flow" | "ledger"
  const [account, setAccount] = useState("");
  const [overview, setOverview] = useState(null);
  const [grants, setGrants] = useState([]);
  const [activity, setActivity] = useState([]);
  const [claimable, setClaimable] = useState(0n); // GEN the contract owes the connected account
  const [pending, setPending] = useState(null); // in-flight withdrawal, or null
  const [selectedId, setSelectedId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState({}); // key -> label
  const [toasts, setToasts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [theme, setTheme] = useState(initialTheme);

  // Reputation ribbons, computed only from the grants loaded from the
  // contract — the full on-chain history, not a sample.
  const reputation = useMemo(() => buildReputation(grants), [grants]);

  // Theme: the manual toggle wins and is persisted; first load respects
  // the system preference.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const onToggleTheme = () => setTheme((t) => toggleTheme(t));

  // Deep link: #grant-<id> opens that grant file on load.
  useEffect(() => {
    const m = window.location.hash.match(/^#grant-(\d+)$/);
    if (m) setSelectedId(Number(m[1]));
  }, []);

  // Keep the address bar in step with the open grant file.
  useEffect(() => {
    if (grants.length === 0) return;
    if (grants.some((g) => Number(g.id) === Number(selectedId))) {
      window.history.replaceState(null, "", `#grant-${selectedId}`);
    }
  }, [grants, selectedId]);

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
      if (account) {
        setClaimable(await getClaimable(account));
        setPending(await getPending(account));
      } else {
        setClaimable(0n);
        setPending(null);
      }
    } catch (e) {
      setLoadError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [account]);

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
      milestones.map((m) => ({
        spec: m.spec,
        amount_wei: genToWei(m.amountGen).toString(),
        deadline: String(m.deadline),
      }))
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
      // fund_grant only credits refunds (wrong amount / wrong sender) — it
      // never pays inline, so it needs no payout allocation. A rejected
      // funding returns FINISHED_WITH_RETURN, so the receipt cannot tell a
      // rejection from a funding: read the grant status and the claim after.
      const { hash } = await sendWrite(
        account,
        "fund_grant",
        [Number(grant.id)],
        totalWei,
        baseFees()
      );
      const fresh = await readJsonView("get_grant", [Number(grant.id)]);
      const credited = await getClaimable(account);
      const funded = fresh && fresh.status === "FUNDED";
      pushToast(
        funded ? "ok" : "warn",
        funded ? "Grant funded" : "Funding rejected — GEN credited back",
        funded
          ? `${weiToGen(totalWei)} GEN escrow locked.`
          : `The contract refused the funding (wrong amount or wrong funder) and recorded ${weiToGen(credited)} GEN as claimable for you — use Withdraw below to receive it.`,
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
    const pct = milestone.verdict && milestone.verdict.payout_pct !== undefined
      ? Number(milestone.verdict.payout_pct)
      : 100;
    const expected = pct >= 100 ? amountWei : (amountWei * BigInt(pct)) / 100n;
    await runWrite(`release-${grant.id}`, "Release tranche", async () => {
      // release_tranche credits both shares (builder's paid share + the
      // grantor's remainder on a PARTIAL) — it never pays inline, so it needs
      // no payout allocation. Verify the builder's credit, not a balance
      // delta: nothing moves on chain until the builder withdraws.
      const before = await getClaimable(grant.builder);
      const { hash } = await sendWrite(
        account,
        "release_tranche",
        [Number(grant.id)],
        0n,
        baseFees()
      );
      const after = await getClaimable(grant.builder);
      const credited = after - before;
      const landed = credited === expected;
      pushToast(
        landed ? "ok" : "warn",
        landed ? "Tranche released — credit verified" : "Release submitted — credit NOT verified",
        landed
          ? `The contract credited ${weiToGen(credited)} GEN to the builder${pct < 100 ? ` (${pct}% of the tranche; the remaining ${weiToGen(amountWei - expected)} GEN is credited to the grantor at the same time)` : ""}. The builder withdraws it to receive it on chain.`
          : `The builder's claimable credit moved by ${weiToGen(credited)} GEN instead of the expected ${weiToGen(expected)} GEN. Check the transaction in the explorer.`,
        hash
      );
    });
  };

  const onAppeal = async (grant) => {
    if (!needWallet()) return;
    await runWrite(`appeal-${grant.id}`, "Request appeal", async () => {
      const { hash, receipt } = await sendWrite(
        account,
        "request_appeal",
        [Number(grant.id)],
        0n,
        baseFees()
      );
      pushToast(
        "ok",
        "Appeal requested",
        "The builder may now submit fresh evidence for one re-assessment. The second verdict is final.",
        hash
      );
    });
  };

  const onExpire = async (grant) => {
    if (!needWallet()) return;
    const milestone = grant.milestones[Number(grant.current_milestone)];
    const refundWei = BigInt(milestone.amount_wei) - BigInt(milestone.paid_wei || "0");
    await runWrite(`expire-${grant.id}`, "Expire milestone", async () => {
      // expire_milestone credits the unclaimed escrow to the grantor — it
      // never pays inline. Verify the grantor's claim, not a balance delta.
      const before = await getClaimable(grant.grantor);
      const { hash } = await sendWrite(
        account,
        "expire_milestone",
        [Number(grant.id)],
        0n,
        baseFees()
      );
      const after = await getClaimable(grant.grantor);
      const credited = after - before;
      const landed = credited === refundWei;
      pushToast(
        landed ? "ok" : "warn",
        landed ? "Milestone expired — refund credited" : "Expiry submitted — refund NOT verified",
        landed
          ? `The contract credited ${weiToGen(credited)} GEN to the grantor. The grantor withdraws it to receive it on chain.`
          : `The grantor's claimable credit moved by ${weiToGen(credited)} GEN instead of the expected ${weiToGen(refundWei)} GEN. Check the transaction in the explorer.`,
        hash
      );
    });
  };

  const onCancel = async (grant) => {
    if (!needWallet()) return;
    const unclaimed = BigInt(grant.total_escrow_wei) - BigInt(grant.released_wei) - BigInt(grant.refunded_wei || "0");
    await runWrite(`cancel-${grant.id}`, "Cancel grant", async () => {
      // cancel_grant credits the unclaimed escrow to the grantor — it never
      // pays inline. Verify the grantor's claim, not a balance delta.
      const before = await getClaimable(grant.grantor);
      const { hash } = await sendWrite(
        account,
        "cancel_grant",
        [Number(grant.id)],
        0n,
        baseFees()
      );
      const after = await getClaimable(grant.grantor);
      const credited = after - before;
      pushToast(
        "ok",
        "Grant cancelled",
        unclaimed > 0n
          ? `Unclaimed escrow returns to the grantor. The contract credited ${weiToGen(credited)} GEN to the grantor — the grantor withdraws it to receive it on chain.`
          : "Grant cancelled. There was no unclaimed escrow to refund.",
        hash
      );
    });
  };

  // --- Withdrawals (the pull pattern) ------------------------------------
  // A release / expiry / cancel only credits a claim. The money moves when
  // the recipient withdraws it — and only a balance delta proves it landed.
  const onWithdraw = async () => {
    if (!needWallet()) return;
    await runWrite("withdraw", "Withdraw claim", async () => {
      // withdraw_claim pays inline, so it carries the payout allocation to
      // the claimant. The claim moves to a pending record first; only the
      // balance delta proves the transfer landed.
      const claim = await getClaimable(account);
      const balBefore = await ethBalance(account);
      const { hash, receipt } = await sendWrite(
        account,
        "withdraw_claim",
        [],
        0n,
        await payoutFees(account)
      );
      const exec = receipt ? receipt.execName || "" : "";
      if (exec === "FINISHED_WITH_ERROR") {
        pushToast(
          "warn",
          "Withdrawal could not run",
          "The contract refused the withdrawal (nothing claimable, or another withdrawal is still pending). No funds moved.",
          hash
        );
        return;
      }
      const balAfter = await ethBalance(account);
      const delta = balAfter - balBefore;
      if (delta > 0n) {
        pushToast(
          "ok",
          "Withdrawal landed — payout verified",
          `Your balance rose by ${weiToGen(delta)} GEN (claim was ${weiToGen(claim)} GEN; the difference is the transaction fee). Confirm receipt below to clear the pending record.`,
          hash
        );
      } else {
        pushToast(
          "warn",
          "Withdrawal submitted — balance did not rise",
          `Your balance did not move, so the transfer may have failed. Do NOT confirm receipt — ask the contract owner to restore the pending withdrawal, then withdraw again. Your claim is not lost.`,
          hash
        );
      }
    });
  };

  const onConfirmWithdrawal = async () => {
    if (!needWallet()) return;
    await runWrite("confirm", "Confirm receipt", async () => {
      const { hash } = await sendWrite(account, "confirm_withdrawal", [], 0n, baseFees());
      pushToast(
        "ok",
        "Receipt confirmed",
        "The pending withdrawal is cleared. If the transfer never arrived, ask the owner to restore it instead — do not confirm a payment you did not receive.",
        hash
      );
    });
  };

  const onRestorePending = async (recipient) => {
    if (!needWallet()) return;
    await runWrite("restore", "Restore pending withdrawal", async () => {
      const { hash } = await sendWrite(
        account,
        "restore_pending",
        [recipient.trim().toLowerCase()],
        0n,
        baseFees()
      );
      pushToast(
        "ok",
        "Pending withdrawal restored",
        `The pending amount for ${shortAddress(recipient)} is claimable again — the recipient can withdraw it.`,
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
    <div className="min-h-screen bg-night font-body text-mist">
      <div className="aurora" aria-hidden="true">
        <div className="aurora-blob aurora-blob-a" />
        <div className="aurora-blob aurora-blob-b" />
        <div className="aurora-blob aurora-blob-c" />
      </div>

      {/* Header */}
      <header className="glass-strong sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:py-4">
          <div className="mr-2">
            <h1 className="font-display text-2xl font-extrabold leading-none tracking-tight sm:text-3xl">
              <span className="text-gradient">GrantFlow</span>
            </h1>
            <p className="mt-1 text-xs tracking-wide text-steel">
              AI-jury grant payouts · GenLayer Bradbury · GrantFlow v3.3
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleTheme}
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-acid/60"
            >
              {theme === "light" ? "☾ Dark" : "☀ Light"}
            </button>
            <span className="hidden rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold sm:inline-block">
              Bradbury · chain 4221 · GEN
            </span>
            <a
              href={explorerAddressUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-xs transition hover:border-acid/60 hover:text-acid"
              title={CONTRACT_ADDRESS}
            >
              {shortAddress(CONTRACT_ADDRESS)} ↗
            </a>
            {account ? (
              <span className="rounded-full bg-acid px-3 py-1.5 text-xs font-bold text-acidInk" title={account}>
                {shortAddress(account)}
              </span>
            ) : (
              <button onClick={onConnect} className="btn-primary px-4 py-1.5 text-xs">
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Protocol stats — bento grid: 2 columns on phone, 3 on tablet, 5 on desktop */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Grants" value={overview ? overview.grant_count : "…"} />
          <Stat label="Assessed" value={overview ? overview.total_assessed : "…"} />
          <Stat label="Escrow held" value={overview ? `${weiToGen(overview.contract_balance_wei)} GEN` : "…"} accent />
          <Stat label="Owner" value={overview ? shortAddress(overview.owner) : "…"} mono />
          <Stat label="Status" value={overview ? (overview.paused ? "Paused" : "Live") : "…"} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="text-xs font-semibold text-acid hover:underline"
          >
            Refresh from chain
          </button>
        </div>
      </div>

      {/* View tabs */}
      <nav className="relative z-10 mx-auto flex max-w-6xl px-4 pt-4" role="tablist" aria-label="Main views">
        <div className="glass flex rounded-full p-1">
          <button
            role="tab"
            aria-selected={view === "flow"}
            onClick={() => setView("flow")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              view === "flow" ? "bg-acid text-acidInk shadow-glow" : "text-steel hover:text-mist"
            }`}
          >
            GrantFlow
          </button>
          <button
            role="tab"
            aria-selected={view === "ledger"}
            onClick={() => setView("ledger")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              view === "ledger" ? "bg-acid text-acidInk shadow-glow" : "text-steel hover:text-mist"
            }`}
          >
            Public Ledger
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16">
        {loading ? (
          <LoadingView />
        ) : loadError && grants.length === 0 ? (
          <div role="alert" className="mt-4 rounded-3xl border border-rose/40 bg-rose/10 p-8 shadow-card">
            <p className="font-display text-xl font-bold">Could not read the contract</p>
            <p className="mt-2 text-sm">{loadError}</p>
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              className="btn-primary mt-4 px-4 py-2.5 text-sm"
            >
              Try again
            </button>
          </div>
        ) : view === "flow" ? (
          <div className="glass fade-up mt-4 rounded-3xl p-4 shadow-card sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Grant files</h2>
              <button
                onClick={() => setShowCreate((s) => !s)}
                className="btn-primary ml-auto px-4 py-2.5 text-sm"
              >
                {showCreate ? "Close form" : "+ New grant"}
              </button>
            </div>
            {showCreate && (
              <CreateGrant onCreate={onCreate} busy={!!busy.create} account={account} onConnect={onConnect} />
            )}

            <RiskHeatmap grants={grants} selectedId={selected ? selected.id : null} onSelect={(id) => setSelectedId(id)} />

            {/* Grant selector — the file tabs */}
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Select a grant file">
              {grants.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(Number(g.id))}
                  aria-pressed={selected && Number(selected.id) === Number(g.id)}
                  className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    selected && Number(selected.id) === Number(g.id)
                      ? "border-acid/60 bg-mint/10 font-semibold shadow-glow"
                      : "border-line bg-panel hover:border-acid/50"
                  }`}
                >
                  <span className="block font-mono text-xs text-steel">#{g.id} · {g.status}</span>
                  <span className="block max-w-56 truncate">{g.title}</span>
                </button>
              ))}
              {grants.length === 0 && (
                <div className="w-full rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
                  No grants yet on this contract. Create the first one — you are the grantor, and you fund it.
                </div>
              )}
            </div>

            {selected && (
              <GrantFile
                grant={selected}
                account={account}
                isOwner={!!isOwner}
                busy={busy}
                reputation={reputation}
                onFund={onFund}
                onSubmitEvidence={onSubmitEvidence}
                onAssess={onAssess}
                onRelease={onRelease}
                onAppeal={onAppeal}
                onExpire={onExpire}
                onCancel={onCancel}
                onConnect={onConnect}
              />
            )}

            {/* Claims — what the contract owes the connected account */}
            {account && (
              <section className="mt-6 rounded-2xl border border-line bg-panel p-4">
                <h3 className="font-display text-lg font-bold">Your claims</h3>
                <p className="text-sm text-steel">
                  A release, expiry or cancel only credits a claim — the GEN moves when you withdraw it.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-steel">Claimable</dt>
                    <dd className="font-semibold">{weiToGen(claimable)} GEN</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-steel">Withdrawal in flight</dt>
                    <dd className="font-semibold">
                      {pending ? `${weiToGen(pending.amount_wei)} GEN` : "None"}
                    </dd>
                  </div>
                  {pending && (
                    <div>
                      <dt className="text-xs text-steel">Restorable by the owner after</dt>
                      <dd className="font-semibold">
                        {new Date((Number(pending.initiated_at) + 600) * 1000).toLocaleTimeString(undefined, { timeStyle: "short" })}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={onWithdraw}
                    disabled={!!busy.withdraw || claimable <= 0n}
                    className="btn-primary px-4 py-2.5 text-sm"
                  >
                    {busy.withdraw ? "Withdrawing…" : `Withdraw ${weiToGen(claimable)} GEN`}
                  </button>
                  {pending && (
                    <button
                      onClick={onConfirmWithdrawal}
                      disabled={!!busy.confirm}
                      className="btn-ghost px-4 py-2.5 text-sm"
                    >
                      {busy.confirm ? "Confirming…" : "Confirm receipt — I received the transfer"}
                    </button>
                  )}
                  {claimable <= 0n && !pending && (
                    <span className="self-center text-xs text-steel">
                      Nothing claimable right now — a release, expiry or cancel credits a claim here first.
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* Owner panel — only the contract owner sees it */}
            {isOwner && (
              <section className="mt-6 rounded-2xl border border-line bg-panel p-4">
                <h3 className="font-display text-lg font-bold">Owner panel</h3>
                <p className="text-sm text-steel">
                  You are the contract owner. These call set_paused and transfer_ownership on the contract.
                  Restoring a pending withdrawal makes it claimable again — only use it when the recipient
                  did not receive the transfer (at least 10 minutes after it started).
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onPause(!overview.paused)}
                    disabled={!!busy.pause}
                    className="rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy.pause ? "Working…" : overview.paused ? "Resume protocol" : "Pause protocol"}
                  </button>
                  <OwnerTransfer onTransfer={onTransferOwnership} busy={!!busy.transfer} />
                </div>
                <div className="mt-3">
                  <RestorePending onRestore={onRestorePending} busy={!!busy.restore} />
                </div>
              </section>
            )}

            {/* Activity — verdict history underneath the file */}
            <section className="mt-6">
              <h3 className="font-display text-lg font-bold">Activity — what the contract recorded</h3>
              {activity.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-dashed border-line p-4 text-center text-sm text-steel">
                  No activity recorded yet.
                </div>
              ) : (
                <ol className="mt-2 space-y-2">
                  {[...activity].reverse().map((a, i) => (
                    <li key={i} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
                      <span className="font-mono text-xs font-semibold text-acid">{a.type || "EVENT"}</span>
                      <span className="ml-2 break-words">{a.message || JSON.stringify(a)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        ) : (
          <div className="glass fade-up mt-4 rounded-3xl p-4 shadow-card sm:p-6">
            <Ledger grants={grants} />
          </div>
        )}

        <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-steel">
          <p>
            GrantFlow v3.3 —{" "}
            <a className="font-mono underline" href={explorerAddressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>{" "}
            on Bradbury (chain 4221). Explorer:{" "}
            <a className="underline" href={EXPLORER_URL} target="_blank" rel="noreferrer">
              {EXPLORER_URL}
            </a>
          </p>
        </footer>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`fade-up rounded-2xl border bg-night2/90 p-3 text-sm shadow-card backdrop-blur-md ${
              t.kind === "error"
                ? "border-rose/40 bg-rose/10"
                : t.kind === "warn"
                  ? "border-gold/40 bg-gold/10"
                  : t.kind === "info"
                    ? "border-cyan/40 bg-cyan/10"
                    : "border-mint/40 bg-mint/10"
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

function Stat({ label, value, mono, accent }) {
  return (
    <div className="glass fade-up rounded-2xl px-4 py-3 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-steel">{label}</p>
      <p
        className={`mt-1 truncate text-lg font-bold ${accent ? "text-gradient" : ""} ${
          mono ? "font-mono text-sm" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OwnerTransfer({ onTransfer, busy }) {
  const [addr, setAddr] = useState("");
  return (
    <span className="inline-flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        placeholder="New owner 0x…"
        className="glass-input w-full rounded-xl px-3 py-2.5 font-mono text-sm sm:w-64"
      />
      <button
        onClick={() => addr.trim() && onTransfer(addr)}
        disabled={busy || !addr.trim()}
        className="btn-ghost px-4 py-2.5 text-sm"
      >
        {busy ? "Working…" : "Transfer ownership"}
      </button>
    </span>
  );
}

function RestorePending({ onRestore, busy }) {
  const [addr, setAddr] = useState("");
  return (
    <span className="inline-flex w-full flex-wrap items-center gap-2">
      <input
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        placeholder="Restore a pending withdrawal — recipient 0x…"
        className="glass-input w-full rounded-xl px-3 py-2.5 font-mono text-sm sm:w-80"
      />
      <button
        onClick={() => addr.trim() && onRestore(addr)}
        disabled={busy || !addr.trim()}
        className="btn-ghost px-4 py-2.5 text-sm"
      >
        {busy ? "Working…" : "Restore pending"}
      </button>
    </span>
  );
}
