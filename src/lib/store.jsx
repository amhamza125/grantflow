// GrantFlow dApp — the ONE store.
//
// Uniswap-model rule: the wallet is the spine of the app, and every part of
// the UI reads the same store. There is no module-level mutable state for
// wallet or grants anywhere else — the old App.jsx kept three (React
// account, module grantCache Map, module activeProvider), which is how the
// header could say "Connect wallet" while a toast said "connected".
//
// This file composes the pure modules (walletSession, grants, activity,
// txlinks) into React state and owns: wallet session, grants loading,
// overview/activity, tx links, funds, all 14 writes, toasts, theme.
// Components read it via useApp() and never hold domain state themselves.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EXPLORER_URL,
  explorerAddressUrl,
  explorerTxUrl,
} from "./config.js";
import {
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
  connectWallet,
  setWalletProvider,
  walletProvider,
} from "./genlayer.js";
import {
  loadSession,
  saveSession,
  clearSession,
  restoreSession,
  attachGuardedListeners,
  readChainId,
  isBradburyChain,
} from "./walletSession.js";
import {
  loadCachedGrants,
  saveCachedGrants,
  clearCachedGrants,
  loadCachedOverview,
  saveCachedOverview,
  dedupeGrants,
  filterGrants,
  countGrants,
  isTestGrant,
  hasAssessedVerdict,
  readGrantWithRetry,
  newestIds,
  BATCH,
} from "./grants.js";
import { buildReputation } from "./reputation.js";
import { initialTheme, applyTheme, toggleTheme } from "./theme.js";
import {
  fetchContractTxs,
  mergeTxLinks,
  recordHash,
  clearTxListCache,
  fetchTxByHash,
  stageIndexFor,
  isTerminalBadStatus,
  TX_STAGES,
} from "./txlinks.js";
import {
  OFFICIAL_CONTRACT_ADDRESS,
  getActiveContract,
  setActiveContractSession,
  resetActiveContractSession,
  isCustomContract as isCustomContractAddress,
  isValidAddress,
  validateOverview,
  addRecentContract,
} from "./contract.js";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default function AppProvider({ children }) {
  // --- wallet session -----------------------------------------------------
  const [account, setAccount] = useState("");
  const [providerName, setProviderName] = useState("");
  const [chainId, setChainId] = useState("");
  const [walletStatus, setWalletStatus] = useState("idle"); // idle | connecting | connected | error
  const [walletError, setWalletError] = useState("");
  const [showChooser, setShowChooser] = useState(false);
  const providerRef = useRef(null);
  const listenerCleanupRef = useRef(null);
  // Live mirror of the connected account for async funds reads: a slow
  // claimable/pending read started for account X must never land after
  // the user switched to account Y (it would paint X's balance over Y's
  // and enable/disable Withdraw against the wrong wallet).
  const accountRef = useRef("");
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  // --- active contract (switcher) -----------------------------------------
  // The contract the dApp reads from and writes to. Official v3.4 by
  // default; a custom address lives only in this session (sessionStorage)
  // after passing the probe — never in localStorage, never from a URL
  // param, never auto-switched.
  const [activeContract, setActiveContract] = useState(() => getActiveContract());
  const [customInfo, setCustomInfo] = useState(() => {
    const a = getActiveContract();
    if (a.toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) return null;
    return loadCachedOverview(a);
  });
  const [contractSwitcherOpen, setContractSwitcherOpen] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [builderFilter, setBuilderFilter] = useState(null);
  // Live assess progress: { grantId, hash, stageIndex, stage, active, failed }
  const [assessProgress, setAssessProgress] = useState(null);
  const assessPollRef = useRef(null);

  // --- grants + overview + activity ---------------------------------------
  const [overview, setOverview] = useState(() => loadCachedOverview());
  const [grants, setGrants] = useState(() => loadCachedGrants().grants);
  const [activity, setActivity] = useState([]);
  // True until the first activity read lands (or fails) — the timeline
  // must show "Loading activity…" while this is true, never "No activity
  // yet", which reads as empty (Atlas was tripped by exactly that in the
  // rebuild verification screenshots).
  const [activityLoading, setActivityLoading] = useState(true);
  const [txLinks, setTxLinks] = useState(() => new Map());
  // Prior assess_milestone txs per grant id, from the explorer tx list
  // ({ grantId: count }). The contract only counts COMPLETED assessments
  // (assess_attempts) — a MAJORITY_DISAGREE / TIMEOUT attempt leaves no
  // on-chain trace at all (grant #15: 11 real attempts, assess_attempts
  // still 0, no ASSESS entry). The tx list is the only record, and the
  // "Assess again" label + the "couldn't agree yet" note read from it.
  const [assessTxCounts, setAssessTxCounts] = useState({});
  const [claimable, setClaimable] = useState(0n);
  const [pending, setPending] = useState(null);
  const [loadedCount, setLoadedCount] = useState(() => loadCachedGrants().grants.length);
  const [totalCount, setTotalCount] = useState(() => loadCachedGrants().count);
  const [grantsLoading, setGrantsLoading] = useState(false); // batches still landing
  const [listReady, setListReady] = useState(() => loadCachedGrants().grants.length > 0);
  const [loadError, setLoadError] = useState("");
  const [failedIds, setFailedIds] = useState([]);
  const refreshRunRef = useRef(0);
  const forceNextRef = useRef(false);
  const didInitialRef = useRef(false);

  // --- selection / filters / ui -------------------------------------------
  const [view, setView] = useState("flow"); // "flow" | "ledger"
  const [selectedId, setSelectedId] = useState(null);
  // True after the user explicitly closes the detail ("‹ All grants").
  // Without this the fallback below would re-open a grant the moment the
  // selection cleared — the back link could never return to a list-only
  // view (caught by verification: the detail stayed open on grant #0,
  // because Number(null) === 0 matched its id).
  const [showcaseDismissed, setShowcaseDismissed] = useState(false);
  // FEATURED is the default feed: the AI-assessed grants first (COMPLETE +
  // MET/PARTIAL) — a first-time visitor sees paying verdicts, never the
  // cancelled test records. "All grants" is one tap away.
  const [feedFilter, setFeedFilter] = useState("FEATURED");
  // Search (title / grant id / party address) + "My grants only" — the
  // toggle persists in localStorage, the query is session-only.
  const [searchQuery, setSearchQuery] = useState("");
  const [myGrantsOnly, setMyGrantsOnly] = useState(() => {
    try {
      return localStorage.getItem("grantflow.myGrantsOnly") === "1";
    } catch {
      return false;
    }
  });
  // The wallet's real GEN balance (ethBalance) — shown in the header pill.
  const [walletBalance, setWalletBalance] = useState(null);
  // When the grants were last re-read from the chain (ms) — the StatsBar
  // shows "Updated X min ago", never a guessed time.
  const [updatedAt, setUpdatedAt] = useState(() => loadCachedGrants().savedAt || null);
  // A "Your turn" card asking for the evidence form: { grantId, ts }.
  // GrantDetail opens the form when it matches its grant, then clears it.
  const [evidenceRequest, setEvidenceRequest] = useState(null);
  const [showTestGrants, setShowTestGrants] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [evidenceTs, setEvidenceTs] = useState({});
  const [toasts, setToasts] = useState([]);
  const [busy, setBusy] = useState({});
  const [theme, setTheme] = useState(initialTheme);

  const fullyLoaded = totalCount > 0 && loadedCount >= totalCount && !grantsLoading;

  // Reputation aggregates are only meaningful over the FULL history — never
  // present partial-load numbers as fact (filmed bug B3: 8→16→28 grants).
  const reputation = useMemo(
    () => (fullyLoaded ? buildReputation(grants) : null),
    [fullyLoaded, grants]
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const onToggleTheme = useCallback(() => setTheme((t) => toggleTheme(t)), []);

  useEffect(() => {
    try {
      localStorage.setItem("grantflow.myGrantsOnly", myGrantsOnly ? "1" : "0");
    } catch {}
  }, [myGrantsOnly]);

  const pushToast = useCallback((kind, title, body, txHash) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, title, body, txHash }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 14000);
  }, []);
  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // --- wallet session lifecycle -------------------------------------------
  const attachListeners = useCallback(
    (provider) => {
      if (listenerCleanupRef.current) listenerCleanupRef.current();
      providerRef.current = provider || null;
      if (!provider) return;
      listenerCleanupRef.current = attachGuardedListeners(provider, {
        onAccounts: (acc) => {
          setAccount(acc);
          setWalletStatus("connected");
          setWalletError("");
          const s = loadSession();
          if (s) saveSession({ ...s, account: acc });
        },
        onChain: (id) => {
          setChainId(typeof id === "string" ? id : "");
          if (id && !isBradburyChain(id)) {
            setWalletError(
              "Your wallet is on the wrong network — switch to GenLayer Bradbury (chain 4221) to use GrantFlow."
            );
          } else {
            setWalletError("");
          }
        },
        onDisconnect: () => {
          setAccount("");
          setProviderName("");
          setWalletStatus("idle");
          clearSession();
        },
      });
    },
    []
  );

  // Restore a saved session on mount — silent, no prompt.
  useEffect(() => {
    let alive = true;
    restoreSession().then((restored) => {
      if (!alive || !restored) return;
      setAccount(restored.account);
      setProviderName(restored.providerName || "Wallet");
      setChainId(restored.chainId || "");
      setWalletStatus("connected");
      attachListeners(restored.provider);
      if (restored.chainId && !isBradburyChain(restored.chainId)) {
        setWalletError(
          "Your wallet is on the wrong network — switch to GenLayer Bradbury (chain 4221) to use GrantFlow."
        );
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll briefly for late injection (in-app browsers inject a few hundred
  // ms after mount) so listeners attach even when no provider exists yet.
  useEffect(() => {
    if (account) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const eth = walletProvider();
      if (eth && eth.on && !listenerCleanupRef.current) attachListeners(eth);
      if (listenerCleanupRef.current || tries >= 10) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(
    () => () => {
      if (listenerCleanupRef.current) listenerCleanupRef.current();
    },
    []
  );

  const openChooser = useCallback(() => {
    setWalletError("");
    setShowChooser(true);
  }, []);
  const closeChooser = useCallback(() => setShowChooser(false), []);

  /** Called by the chooser after a successful connect. */
  const onWalletConnected = useCallback(
    (acc, meta = {}) => {
      const provider = meta.provider || walletProvider();
      if (provider) {
        setWalletProvider(provider);
        attachListeners(provider);
      }
      setAccount(acc);
      setProviderName(meta.providerName || "Wallet");
      setWalletStatus("connected");
      setWalletError("");
      setShowChooser(false);
      saveSession({
        account: acc,
        providerId: meta.providerId || "legacy-ethereum",
        providerName: meta.providerName || "Wallet",
      });
      readChainId(provider).then((id) => {
        setChainId(id);
        if (id && !isBradburyChain(id)) {
          setWalletError(
            "Your wallet is on the wrong network — switch to GenLayer Bradbury (chain 4221) to use GrantFlow."
          );
        }
      });
      pushToast("ok", "Wallet connected", `${shortAddress(acc)} — connected to Bradbury (chain 4221).`);
    },
    [attachListeners, pushToast]
  );

  const onWalletError = useCallback((msg) => {
    setWalletStatus("error");
    setWalletError(
      `Could not connect the wallet (${msg}). If your wallet is locked, unlock it and try again. If you rejected the request, tap Connect wallet again and approve it. If the chain switch failed, switch to GenLayer Bradbury (chain 4221) in the wallet and try again. If there is no wallet in this browser, open this page inside MetaMask or Rabby, or use WalletConnect.`
    );
  }, []);

  const disconnect = useCallback(() => {
    try {
      const p = walletProvider();
      if (p && typeof p.disconnect === "function") p.disconnect();
    } catch {}
    setWalletProvider(null);
    if (listenerCleanupRef.current) listenerCleanupRef.current();
    listenerCleanupRef.current = null;
    providerRef.current = null;
    setAccount("");
    setProviderName("");
    setChainId("");
    setWalletStatus("idle");
    setWalletError("");
    setClaimable(0n);
    setPending(null);
    setWalletBalance(null);
    clearSession();
  }, []);

  const needWallet = useCallback(() => {
    if (!account) {
      pushToast(
        "error",
        "Wallet not connected",
        "Connect your wallet first — every write is signed by you, in your browser."
      );
      return false;
    }
    return true;
  }, [account, pushToast]);

  // --- live assess progress -----------------------------------------------
  // While an assess_milestone tx is in flight, the jury card shows a live
  // progress bar. The poller reads the tx's status from the explorer every
  // 5s and maps it onto TX_STAGES (verified against the SDK enum + the
  // scan API's lowercase status field). A terminal-bad status marks the
  // run failed; "finalized" ends it. The receipt wait in sendWrite is the
  // primary completion path — the poller is only the live display, so a
  // stalled poll can never hang the bar forever.
  const stopAssessPoll = useCallback(() => {
    if (assessPollRef.current) {
      clearInterval(assessPollRef.current);
      assessPollRef.current = null;
    }
  }, []);

  const startAssessPoll = useCallback(
    (grantId, hash) => {
      stopAssessPoll();
      setAssessProgress({
        grantId: Number(grantId),
        hash,
        stageIndex: 0,
        stage: "PENDING",
        active: true,
        failed: false,
      });
      assessPollRef.current = setInterval(async () => {
        const tx = await fetchTxByHash(hash);
        if (!tx) return; // not indexed yet — keep the last known stage
        if (isTerminalBadStatus(tx.status)) {
          stopAssessPoll();
          setAssessProgress((p) => (p && p.hash === hash ? { ...p, active: false, failed: true } : p));
          return;
        }
        const idx = stageIndexFor(tx.status);
        if (idx >= 0) {
          setAssessProgress((p) =>
            p && p.hash === hash ? { ...p, stageIndex: idx, stage: TX_STAGES[idx] } : p
          );
          if (idx === TX_STAGES.length - 1) stopAssessPoll();
        }
      }, 5000);
    },
    [stopAssessPoll]
  );

  useEffect(() => () => stopAssessPoll(), [stopAssessPoll]);

  // --- grants loading -----------------------------------------------------
  // Cache-first, never gated: the shell and any cached grants paint on
  // mount; the overview loads into the stats bar independently; batches
  // paint as they land. The list is never replaced by a skeleton wall.
  const refresh = useCallback(
    async (force = false, revalidate = false) => {
      const runId = ++refreshRunRef.current;
      const stale = () => runId !== refreshRunRef.current;
      if (force) {
        clearCachedGrants();
        setFailedIds([]);
      }
      setLoadError("");
      // Side reads run concurrently with the grants — none blocks the list.
      const side = (async () => {
        setActivityLoading(true);
        try {
          const hist = await readJsonView("get_activity_history", [200]);
          if (!stale()) {
            setActivity(Array.isArray(hist) ? hist : []);
            setActivityLoading(false);
          }
        } catch {
          // Activity is nice-to-have; the grants are the page. But the
          // loading flag must clear so the timeline can say "No activity
          // yet" instead of spinning forever.
          if (!stale()) setActivityLoading(false);
        }
        if (account) {
          try {
            const c = await getClaimable(account);
            if (!stale() && accountRef.current === account) setClaimable(c);
          } catch {}
          try {
            const p = await getPending(account);
            if (!stale() && accountRef.current === account) setPending(p);
          } catch {}
          try {
            const b = await ethBalance(account);
            if (!stale() && accountRef.current === account) setWalletBalance(b);
          } catch {}
        } else if (!stale()) {
          setClaimable(0n);
          setPending(null);
          setWalletBalance(null);
        }
      })();
      const cached = loadCachedGrants();
      const hadKnownCount = cached.count > 0;
      let firstBatchIds = [];
      if (hadKnownCount) {
        const ids = newestIds(cached.count, BATCH);
        firstBatchIds = revalidate ? ids : ids.filter((id) => !cached.grants.some((g) => Number(g.id) === id));
      }
      const firstBatch =
        firstBatchIds.length > 0
          ? Promise.allSettled(firstBatchIds.map((id) => readGrantWithRetry(id))).then((rs) =>
              rs.map((r) => (r.status === "fulfilled" ? r.value : null))
            )
          : Promise.resolve([]);
      let ov = null;
      try {
        ov = await readJsonView("get_protocol_overview", []);
      } catch (e) {
        // Overview failed: keep whatever grants we have and show a visible
        // error — never a silent skeleton, never a blank list.
        if (stale()) return;
        setLoadError(friendlyError(e));
        const first = await firstBatch;
        if (stale()) return;
        const merged = dedupeGrants([...cached.grants, ...first.filter(Boolean)]);
        if (merged.length > 0) {
          setGrants(merged);
          setLoadedCount(merged.length);
          setListReady(true);
        }
        setGrantsLoading(false);
        await side;
        setUpdatedAt(Date.now());
        return;
      }
      if (stale()) return;
      setOverview(ov);
      saveCachedOverview(ov);
      const count = Number(ov.grant_count || 0);
      setTotalCount(count);
      const failed = new Set();
      let freshLoaded = 0;
      let first = await firstBatch;
      if (stale()) return;
      if (!hadKnownCount && firstBatchIds.length === 0 && count > 0) {
        const ids = newestIds(count, BATCH);
        const rs = await Promise.allSettled(ids.map((id) => readGrantWithRetry(id)));
        if (stale()) return;
        first = rs.map((r) => (r.status === "fulfilled" ? r.value : null));
        firstBatchIds = ids;
      }
      let list = dedupeGrants(cached.grants);
      first.forEach((g, k) => {
        const id = firstBatchIds[k];
        if (id >= count) return;
        if (g) {
          list = dedupeGrants([...list, g]);
          freshLoaded += 1;
        } else if (!revalidate || !list.some((x) => Number(x.id) === id)) {
          failed.add(id);
        }
      });
      setGrants(list);
      saveCachedGrants(list, count);
      setLoadedCount(list.length);
      // The overview read succeeded and the first pass merged — the list
      // state is KNOWN even when the contract holds zero grants. (Was
      // `list.length > 0`, which kept listReady false forever on an empty
      // contract and suppressed every empty state in GrantList.)
      setListReady(true);
      setFailedIds([...failed].sort((a, b) => b - a));
      // Remaining grants, newest first, in parallel batches, rendering as
      // each lands. In revalidate mode every id is re-read fresh (the
      // cached list stays visible meanwhile); otherwise only the missing.
      const fetchedFirst = new Set(firstBatchIds);
      const remaining = [];
      for (let i = count - 1; i >= 0; i -= 1) {
        if (fetchedFirst.has(i)) continue;
        if (!revalidate && list.some((x) => Number(x.id) === i)) continue;
        remaining.push(i);
      }
      setGrantsLoading(remaining.length > 0);
      for (let s = 0; s < remaining.length; s += BATCH) {
        const chunk = remaining.slice(s, s + BATCH);
        const settled = await Promise.allSettled(chunk.map((id) => readGrantWithRetry(id)));
        const results = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
        if (stale()) return;
        const fresh = results.filter(Boolean);
        fresh.forEach((g) => {
          freshLoaded += 1;
        });
        results.forEach((g, k) => {
          if (!g && (!revalidate || !list.some((x) => Number(x.id) === chunk[k]))) failed.add(chunk[k]);
        });
        list = dedupeGrants([...list, ...fresh]);
        setGrants(list);
        saveCachedGrants(list, count);
        setLoadedCount(list.length);
        setFailedIds([...failed].sort((a, b) => b - a));
      }
      if (stale()) return;
      setGrantsLoading(false);
      setFailedIds([...failed].sort((a, b) => b - a));
      await side;
      setUpdatedAt(Date.now());
    },
    [account]
  );

  const retryGrant = useCallback(async (id) => {
    const runId = refreshRunRef.current;
    setFailedIds((f) => f.filter((x) => x !== id));
    const g = await readGrantWithRetry(id);
    if (runId !== refreshRunRef.current) return;
    if (g) {
      setGrants((prev) => {
        const next = dedupeGrants([...prev, g]);
        saveCachedGrants(next, totalCount);
        setLoadedCount(next.length);
        return next;
      });
    } else {
      setFailedIds((f) => [...f, id].sort((a, b) => b - a));
    }
  }, [totalCount]);

  const refreshFunds = useCallback(async () => {
    if (!account) {
      setClaimable(0n);
      setPending(null);
      setWalletBalance(null);
      return;
    }
    // Guard every write with the account this read was started for — if
    // the user switched wallets while the read was in flight, drop it.
    const forAccount = account;
    const stillMine = () => accountRef.current === forAccount;
    try {
      const c = await getClaimable(account);
      if (stillMine()) setClaimable(c);
    } catch {}
    try {
      const p = await getPending(account);
      if (stillMine()) setPending(p);
    } catch {}
    try {
      const b = await ethBalance(account);
      if (stillMine()) setWalletBalance(b);
    } catch {}
  }, [account]);

  const forceRefresh = useCallback(() => {
    refresh(true);
  }, [refresh]);

  // --- contract switching ---------------------------------------------------
  // These live after refresh() because they call it — a useCallback that
  // lists refresh in its deps before refresh is declared would crash the
  // render (temporal dead zone).
  //
  // Reset every piece of per-contract in-memory state. The cache keys are
  // address-keyed, so nothing from the old contract can leak into the new
  // one — but the in-memory lists must be cleared explicitly, or the old
  // grants would paint while the new ones load.
  const resetContractState = useCallback(() => {
    setGrants([]);
    setActivity([]);
    setTxLinks(new Map());
    setOverview(null);
    setTotalCount(0);
    setLoadedCount(0);
    setListReady(false);
    setGrantsLoading(false);
    setLoadError("");
    setFailedIds([]);
    setSelectedId(null);
    setShowcaseDismissed(false);
    setBuilderFilter(null);
    setEvidenceTs({});
    setAssessProgress(null);
    setClaimable(0n);
    setPending(null);
    setWalletBalance(null);
    setAssessTxCounts({});
    // The feed goes back to its default on a new contract — a search or a
    // status filter from the old contract must never hide the new one's
    // grants. "My grants only" is a preference, so it stays.
    setFeedFilter("FEATURED");
    setSearchQuery("");
  }, []);

  const resetContract = useCallback(async () => {
    resetActiveContractSession();
    setActiveContract(OFFICIAL_CONTRACT_ADDRESS);
    setCustomInfo(null);
    resetContractState();
    refresh(true);
    pushToast(
      "ok",
      "Back to the official contract",
      "GrantFlow v3.4 — the official contract. This is where the real grants live."
    );
  }, [resetContractState, refresh, pushToast]);

  // Probe-first switch: the address must answer get_protocol_overview as a
  // GrantFlow contract (see contract.js validateOverview) before anything
  // is committed. A failed probe changes nothing — the dApp stays on the
  // previous contract and the caller shows the error.
  const switchContract = useCallback(
    async (input) => {
      const addr = String(input || "").trim();
      if (!isValidAddress(addr)) {
        return {
          ok: false,
          error: "That is not a valid contract address — it must be 0x followed by 40 hex characters.",
        };
      }
      if (addr.toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) {
        await resetContract();
        return { ok: true, official: true };
      }
      setSwitchBusy(true);
      try {
        let ov;
        try {
          ov = await readJsonView("get_protocol_overview", [], addr);
        } catch {
          return {
            ok: false,
            error:
              "That address did not answer — the call failed. It may not be a contract, or the chain did not respond. The dApp is still on the previous contract.",
          };
        }
        const check = validateOverview(ov);
        if (!check.ok) {
          return {
            ok: false,
            error: `${check.reason} The dApp is still on the previous contract.`,
          };
        }
        // Probe passed — commit. sessionStorage is written first so the
        // refresh that follows reads the new contract.
        setActiveContractSession(addr);
        addRecentContract(addr);
        setActiveContract(addr);
        setCustomInfo(ov);
        resetContractState();
        saveCachedOverview(ov, addr);
        refresh(true);
        pushToast(
          "ok",
          "Now using custom contract",
          `${shortAddress(addr)} — this is a test contract, not the official GrantFlow v3.4. Writes go here only.`
        );
        return { ok: true, overview: ov, version: check.version };
      } finally {
        setSwitchBusy(false);
      }
    },
    [resetContract, resetContractState, refresh, pushToast]
  );

  // Re-read everything for the active contract from the chain. The tx-list
  // cache is cleared too; the recorded-hash store is not (it holds exact
  // write-time records, not stale reads).
  const reloadContractState = useCallback(() => {
    clearTxListCache(activeContract);
    refresh(true);
    pushToast("ok", "Contract state reloaded", "Grants, overview and the explorer tx list were re-read from the chain.");
  }, [activeContract, refresh, pushToast]);

  // First mount revalidates: the cached list (if any) renders instantly,
  // and refresh() re-reads every grant fresh in the background.
  useEffect(() => {
    const force = forceNextRef.current;
    forceNextRef.current = false;
    const revalidate = !didInitialRef.current && !force;
    didInitialRef.current = true;
    refresh(force, revalidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the account changes, only the wallet's funds change — re-read
  // claimable/pending, not the whole grant list.
  useEffect(() => {
    refreshFunds();
  }, [refreshFunds]);

  // --- tx links -------------------------------------------------------------
  // Explorer tx list loads in the background and never blocks the page.
  // Recorded dApp hashes (exact) always win over API matches.
  useEffect(() => {
    let alive = true;
    fetchContractTxs()
      .then((txs) => {
        if (!alive) return;
        setTxLinks(mergeTxLinks(activity, txs));
        const counts = {};
        for (const tx of txs || []) {
          if (tx?.fn !== "assess_milestone" || !Array.isArray(tx.args)) continue;
          const gid = Number(tx.args[0]);
          if (!Number.isFinite(gid)) continue;
          counts[gid] = (counts[gid] || 0) + 1;
        }
        setAssessTxCounts(counts);
      })
      .catch(() => {
        // Explorer API down — entries fall back to the contract-page link.
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  /** After a write finalizes, find its new activity entry and record the hash. */
  const recordWriteHash = useCallback(async (types, grantId, hash) => {
    if (!hash) return;
    try {
      const hist = await readJsonView("get_activity_history", [10]);
      if (!Array.isArray(hist)) return;
      const wanted = new Set(types);
      let best = null;
      for (const e of hist) {
        if (!wanted.has(e.type)) continue;
        if (grantId !== undefined && grantId !== null) {
          const gid = e.grant_id !== undefined && e.grant_id !== null ? Number(e.grant_id) : null;
          if (gid !== Number(grantId)) continue;
        }
        if (!best || Number(e.seq || 0) > Number(best.seq || 0)) best = e;
      }
      if (best?.seq !== undefined && best.seq !== null) {
        recordHash(best.seq, hash);
        setTxLinks((prev) => {
          const next = new Map(prev);
          next.set(Number(best.seq), { hash, exact: true });
          return next;
        });
      }
    } catch {
      // Hash recording is best-effort; the toast already links the tx.
    }
  }, []);

  // --- writes ---------------------------------------------------------------
  const runWrite = useCallback(
    async (key, label, fn) => {
      if (busy[key]) return null;
      setBusy((b) => ({ ...b, [key]: label }));
      try {
        const res = await fn();
        // A write changes chain state: the refresh after it re-reads
        // everything (cache cleared), it never trusts the old cache.
        forceNextRef.current = true;
        refresh(true);
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
    [busy, pushToast, refresh]
  );

  const onCreate = useCallback(
    async ({ builder, title, milestones }) => {
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
        await recordWriteHash(["CREATE"], null, hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onFund = useCallback(
    async (grant) => {
      if (!needWallet()) return;
      const totalWei = BigInt(grant.total_escrow_wei);
      await runWrite(`fund-${grant.id}`, "Fund grant", async () => {
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
        await recordWriteHash(["FUND"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onSubmitEvidence = useCallback(
    async (grant, summary, links) => {
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
        setEvidenceTs((t) => ({
          ...t,
          [`${grant.id}-${Number(grant.current_milestone)}`]: Date.now(),
        }));
        pushToast(
          "ok",
          "Evidence submitted",
          `submit_evidence is ${receipt ? receipt.statusName || receipt.status_name || receipt.status : "submitted"} — the milestone now awaits jury assessment.`,
          hash
        );
        await recordWriteHash(["EVIDENCE"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onAssess = useCallback(
    async (grant) => {
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
          baseFees(),
          {
            // The hash is known as soon as the wallet returns it — start
            // the live progress bar now, while consensus still runs.
            onHash: (h) => startAssessPoll(grant.id, h),
          }
        );
        const exec = receipt ? receipt.execName || "" : "";
        // The tx finalized (or the receipt wait gave up) — the live bar
        // ends here; it clears itself shortly after.
        stopAssessPoll();
        setAssessProgress((p) =>
          p && p.hash === hash
            ? { ...p, active: false, stageIndex: 5, stage: "FINALIZED" }
            : p
        );
        setTimeout(() => {
          setAssessProgress((p) => (p && p.hash === hash ? null : p));
        }, 15000);
        pushToast(
          exec === "FINISHED_WITH_ERROR" ? "warn" : "ok",
          exec === "FINISHED_WITH_ERROR" ? "Assessment could not run" : "Assessment complete",
          exec === "FINISHED_WITH_ERROR"
            ? "The jury could not assess this milestone (evidence missing or unreachable, or wrong state). No funds moved — the milestone stays open for resubmission."
            : "The jury has returned a verdict. Open the milestone below to read it with its grounding receipt.",
          hash
        );
        await recordWriteHash(["ASSESS", "JURY_FAILURE", "EVIDENCE_FAILURE"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash, startAssessPoll, stopAssessPoll]
  );

  const onRelease = useCallback(
    async (grant) => {
      if (!needWallet()) return;
      const milestone = grant.milestones[Number(grant.current_milestone)];
      const amountWei = BigInt(milestone.amount_wei);
      const pct =
        milestone.verdict && milestone.verdict.payout_pct !== undefined
          ? Number(milestone.verdict.payout_pct)
          : 100;
      const expected = pct >= 100 ? amountWei : (amountWei * BigInt(pct)) / 100n;
      await runWrite(`release-${grant.id}`, "Release tranche", async () => {
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
        await recordWriteHash(["RELEASE"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onAppeal = useCallback(
    async (grant) => {
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
        await recordWriteHash(["APPEAL"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onExpire = useCallback(
    async (grant) => {
      if (!needWallet()) return;
      const milestone = grant.milestones[Number(grant.current_milestone)];
      const refundWei = BigInt(milestone.amount_wei) - BigInt(milestone.paid_wei || "0");
      await runWrite(`expire-${grant.id}`, "Expire milestone", async () => {
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
        await recordWriteHash(["EXPIRE"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onCancel = useCallback(
    async (grant) => {
      if (!needWallet()) return;
      const unclaimed =
        BigInt(grant.total_escrow_wei) - BigInt(grant.released_wei) - BigInt(grant.refunded_wei || "0");
      await runWrite(`cancel-${grant.id}`, "Cancel grant", async () => {
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
        await recordWriteHash(["CANCEL"], Number(grant.id), hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onWithdraw = useCallback(async () => {
    if (!needWallet()) return;
    await runWrite("withdraw", "Withdraw claim", async () => {
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
      await recordWriteHash(["WITHDRAW"], null, hash);
    });
  }, [account, needWallet, runWrite, pushToast, recordWriteHash]);

  const onConfirmWithdrawal = useCallback(async () => {
    if (!needWallet()) return;
    await runWrite("confirm", "Confirm receipt", async () => {
      const { hash } = await sendWrite(account, "confirm_withdrawal", [], 0n, baseFees());
      pushToast(
        "ok",
        "Receipt confirmed",
        "The pending withdrawal is cleared. If the transfer never arrived, ask the owner to restore it instead — do not confirm a payment you did not receive.",
        hash
      );
      await recordWriteHash(["CONFIRM"], null, hash);
    });
  }, [account, needWallet, runWrite, pushToast, recordWriteHash]);

  const onRestorePending = useCallback(
    async (recipient) => {
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
        await recordWriteHash(["RESTORE"], null, hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onPause = useCallback(
    async (paused) => {
      if (!needWallet()) return;
      await runWrite("pause", paused ? "Pause protocol" : "Resume protocol", async () => {
        const { hash } = await sendWrite(account, "set_paused", [paused], 0n, baseFees());
        pushToast("ok", paused ? "Protocol paused" : "Protocol resumed", "set_paused confirmed on chain.", hash);
        await recordWriteHash([paused ? "PAUSE" : "RESUME"], null, hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onTransferOwnership = useCallback(
    async (newOwner) => {
      if (!needWallet()) return;
      await runWrite("transfer", "Transfer ownership", async () => {
        const { hash } = await sendWrite(account, "transfer_ownership", [newOwner.trim().toLowerCase()], 0n, baseFees());
        pushToast(
          "ok",
          "Ownership transfer requested",
          `${shortAddress(newOwner)} must accept it on chain (accept_ownership) before ownership changes. Until then you are still the owner.`,
          hash
        );
        await recordWriteHash(["TRANSFER_OWNERSHIP"], null, hash);
      });
    },
    [account, needWallet, runWrite, pushToast, recordWriteHash]
  );

  const onAcceptOwnership = useCallback(async () => {
    if (!needWallet()) return;
    await runWrite("accept", "Accept ownership", async () => {
      const { hash } = await sendWrite(account, "accept_ownership", [], 0n, baseFees());
      pushToast("ok", "Ownership accepted", "You are now the contract owner.", hash);
      await recordWriteHash(["TRANSFER_OWNERSHIP"], null, hash);
    });
  }, [account, needWallet, runWrite, pushToast, recordWriteHash]);

  const onSweep = useCallback(async () => {
    if (!needWallet()) return;
    await runWrite("sweep", "Sweep excess", async () => {
      // sweep_excess emits _pay like withdraw_claim — it MUST carry the
      // payout allocation (payoutFees), or the payout message is emitted
      // but never executes and the excess silently stays in the contract
      // (proven live on the burner, 2026-11-12: baseFees left 0.005 GEN
      // behind while this toast claimed it was paid).
      const { hash } = await sendWrite(account, "sweep_excess", [], 0n, await payoutFees(account));
      pushToast(
        "ok",
        "Excess swept",
        "Any GEN above locked escrow + claimable + pending was paid to the owner on chain.",
        hash
      );
      await recordWriteHash(["SWEEP"], null, hash);
    });
  }, [account, needWallet, runWrite, pushToast, recordWriteHash]);

  // --- derived ----------------------------------------------------------------
  // A builder filter (from the jury card's "Builder record" link) narrows
  // the feed to that builder's JUDGED milestones only — the record it
  // links from. The feed pills still apply on top.
  const filterBuilder = useCallback((builder) => {
    setBuilderFilter(builder ? String(builder).toLowerCase() : null);
    setFeedFilter("ALL");
    setView("flow");
  }, []);
  const clearBuilderFilter = useCallback(() => setBuilderFilter(null), []);

  const visibleGrants = useMemo(() => {
    let list = filterGrants(grants, { feedFilter, showTestGrants, account });
    if (builderFilter) {
      const bf = builderFilter.toLowerCase();
      list = list.filter(
        (g) =>
          String(g.builder || "").toLowerCase() === bf &&
          (g.milestones || []).some((m) => m.verdict)
      );
    }
    // "My grants only" — the search-row toggle, independent of the pills.
    const me = (account || "").toLowerCase();
    if (myGrantsOnly) {
      if (!me) list = [];
      else {
        list = list.filter(
          (g) =>
            String(g.grantor || "").toLowerCase() === me ||
            String(g.builder || "").toLowerCase() === me
        );
      }
    }
    // Search: grant number, title, or party address (case-insensitive).
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const isNum = /^\d+$/.test(q);
      list = list.filter((g) => {
        if (isNum && Number(g.id) === Number(q)) return true;
        if (String(g.title || "").toLowerCase().includes(q)) return true;
        if (String(g.grantor || "").toLowerCase().includes(q)) return true;
        if (String(g.builder || "").toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return list;
  }, [grants, feedFilter, showTestGrants, account, builderFilter, myGrantsOnly, searchQuery]);

  // "Your turn" — grants where the connected wallet is a party AND an
  // action is waiting on them. One entry per grant: { grant, action,
  // label }. The section is personal — it shows only this wallet's own
  // grants — so the feed's test-title rule does NOT apply here: a grant
  // where you are the grantor and an action waits IS your work, whatever
  // its title (the approved mockup shows #15 "Assess again" here).
  // The action is the grant's single next step for this wallet; the card
  // runs one-tap writes directly, and evidence/fund jump to the detail
  // (the form / the custom-contract confirm live there).
  const yourTurn = useMemo(() => {
    if (!account) return [];
    const me = account.toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);
    const out = [];
    for (const g of grants || []) {
      const isGrantor = String(g.grantor || "").toLowerCase() === me;
      const isBuilder = String(g.builder || "").toLowerCase() === me;
      if (!isGrantor && !isBuilder) continue;
      const cur = (g.milestones || [])[Number(g.current_milestone)] || null;
      if (!cur) continue;
      const st = String(g.status || "");
      const mst = String(cur.status || "");
      const verdictName = cur.verdict
        ? cur.verdict.verdict || (cur.verdict.met ? "MET" : "NOT_MET")
        : null;
      if (st === "PENDING_FUNDING" && isGrantor) {
        out.push({ grant: g, action: "fund", label: `Fund — ${weiToGen(g.total_escrow_wei)} GEN` });
      } else if (st === "FUNDED") {
        const deadlinePassed =
          Number(cur.deadline || 0) > 0 && nowSec >= Number(cur.deadline);
        const expirable = ["OPEN", "SUBMITTED", "REJECTED_FINAL"].includes(mst);
        if (mst === "OPEN" && isBuilder) {
          out.push({ grant: g, action: "evidence", label: "Submit evidence" });
        } else if (mst === "SUBMITTED" && (isGrantor || isBuilder)) {
          // Prior attempts = completed assessments (assess_attempts) or
          // assess txs on the explorer list — a disagreed/timed-out
          // attempt leaves no on-chain trace, so the field alone reads
          // 0 after 11 real tries (#15). For a SUBMITTED milestone the
          // field is always 0 (a completed assessment moves it on), so
          // the tx count is exact here.
          const priorAttempts = Math.max(
            Number(cur.assess_attempts || 0),
            Number(assessTxCounts[Number(g.id)] || 0)
          );
          out.push({
            grant: g,
            action: "assess",
            label: priorAttempts > 0 ? "Assess again" : "Assess milestone",
            attempts: priorAttempts,
          });
        } else if ((mst === "APPROVED" || mst === "PARTIAL") && isGrantor) {
          out.push({ grant: g, action: "release", label: "Release tranche" });
        } else if (verdictName === "NOT_MET" && !cur.verdict_final && isBuilder) {
          out.push({ grant: g, action: "appeal", label: "Request the one appeal" });
        } else if (expirable && deadlinePassed) {
          out.push({ grant: g, action: "expire", label: "Expire milestone" });
        }
      }
    }
    return out.sort((a, b) => Number(b.grant.id) - Number(a.grant.id));
  }, [grants, account, assessTxCounts]);

  const requestEvidence = useCallback(
    (grantId) => setEvidenceRequest({ grantId: Number(grantId), ts: Date.now() }),
    []
  );
  const clearEvidenceRequest = useCallback(() => setEvidenceRequest(null), []);

  const feedCounts = useMemo(
    () => countGrants(grants, { showTestGrants, account }),
    [grants, showTestGrants, account]
  );
  const hiddenTestCount = useMemo(() => grants.filter((g) => isTestGrant(g)).length, [grants]);
  // Showcase = the AI-assessed COMPLETE grants (MET / PARTIAL verdicts +
  // grounding receipts live here), newest first. "Inspect a Live AI
  // Verdict" jumps to showcaseIds[0] — it must land on a real verdict,
  // never on a cancelled test grant (#27 CANCELLED used to lead).
  const showcaseIds = useMemo(
    () =>
      grants
        .filter((g) => !isTestGrant(g) && hasAssessedVerdict(g))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, 3)
        .map((g) => Number(g.id)),
    [grants]
  );
  // The grant file open by default: the newest assessed COMPLETE grant in
  // the visible feed (a real verdict + grounding receipt), not the newest
  // grant overall. The LIST order stays newest-first — only the default
  // open file changes. A deep link (#grant-N) or a tap always wins. When
  // nothing is selected AND the user dismissed the detail, nothing opens
  // — the back link must return to a list-only view. (Number(null) is 0,
  // so the old unguarded find() matched grant #0 and the detail could
  // never close.)
  const defaultShowcase =
    visibleGrants.find((g) => showcaseIds.includes(Number(g.id))) || null;
  const selected =
    selectedId !== null
      ? grants.find((g) => Number(g.id) === Number(selectedId)) || null
      : showcaseDismissed
        ? null
        : defaultShowcase || visibleGrants[0] || grants[0] || null;
  const isOwner =
    !!account && !!overview && account.toLowerCase() === String(overview.owner || "").toLowerCase();
  const isPaused = !!overview?.paused;

  const selectGrant = useCallback((id) => {
    const n = id === null || id === undefined ? null : Number(id);
    setSelectedId(n);
    // Closing the detail dismisses the default showcase too — otherwise
    // the fallback re-opens a grant and "‹ All grants" never shows the
    // list alone. Opening any grant re-arms the showcase for the next
    // close (a fresh selection is a fresh start, not a dismissal).
    setShowcaseDismissed(n === null);
    try {
      if (n !== null) window.location.hash = `grant-${n}`;
      else if (window.history?.replaceState) {
        // Clearing the selection clears the deep link too, or a reload
        // would silently re-select the grant just left.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch {}
  }, []);

  // Deep link: #grant-<id> selects the grant (kept across reloads AND
  // in-session — the mount-only effect missed same-document navigation,
  // so a link pasted while already on the page did nothing). The
  // hashchange listener makes an in-session deep link switch the detail.
  useEffect(() => {
    const applyHash = () => {
      try {
        const m = window.location.hash.match(/#grant-(\d+)/);
        if (m) setSelectedId(Number(m[1]));
      } catch {}
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const value = {
    // wallet
    account,
    providerName,
    chainId,
    walletStatus,
    walletError,
    showChooser,
    openChooser,
    closeChooser,
    onWalletConnected,
    onWalletError,
    disconnect,
    // data
    overview,
    grants,
    visibleGrants,
    feedCounts,
    hiddenTestCount,
    showcaseIds,
    activity,
    activityLoading,
    txLinks,
    assessTxCounts,
    loadedCount,
    totalCount,
    grantsLoading,
    listReady,
    fullyLoaded,
    loadError,
    failedIds,
    retryGrant,
    refresh: forceRefresh,
    refreshFunds,
    reputation,
    claimable,
    pending,
    isOwner,
    isPaused,
    // selection / filters
    view,
    setView,
    selectedId,
    selectGrant,
    selected,
    feedFilter,
    setFeedFilter,
    searchQuery,
    setSearchQuery,
    myGrantsOnly,
    setMyGrantsOnly,
    yourTurn,
    evidenceRequest,
    requestEvidence,
    clearEvidenceRequest,
    walletBalance,
    updatedAt,
    showTestGrants,
    setShowTestGrants,
    builderFilter,
    filterBuilder,
    clearBuilderFilter,
    assessProgress,
    // active contract (switcher)
    activeContract,
    isCustomContract: isCustomContractAddress(activeContract),
    customInfo,
    switchContract,
    resetContract,
    reloadContractState,
    switchBusy,
    contractSwitcherOpen,
    setContractSwitcherOpen,
    // writes
    onCreate,
    onFund,
    onSubmitEvidence,
    onAssess,
    onRelease,
    onAppeal,
    onExpire,
    onCancel,
    onWithdraw,
    onConfirmWithdrawal,
    onRestorePending,
    onPause,
    onTransferOwnership,
    onAcceptOwnership,
    onSweep,
    busy,
    // ui
    toasts,
    pushToast,
    dismissToast,
    theme,
    onToggleTheme,
    showCreate,
    setShowCreate,
    evidenceTs,
    // constants
    CONTRACT_ADDRESS: activeContract,
    OFFICIAL_CONTRACT_ADDRESS,
    EXPLORER_URL,
    explorerAddressUrl,
    explorerTxUrl,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
