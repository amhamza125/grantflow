// Grant loading primitives for the rebuilt dApp — pure helpers, no React.
//
// The old code kept grants in a module-level Map plus React state plus
// sessionStorage (5-minute TTL, empty in a fresh in-app-browser webview),
// and gated the first paint on overview-then-batch-1. This module:
//   * caches in localStorage (30-minute TTL — survives webview restarts);
//   * dedups at EVERY ingest boundary through one keyed structure;
//   * never lets a raw stored array reach the UI (initial state comes from
//     the deduped Map, not the parsed JSON);
//   * exposes the same batch-8 / 400ms-retry reader the old code proved.
import { CONTRACT_ADDRESS } from "./config.js";
import { getActiveContract, grantCacheKey, overviewCacheKey } from "./contract.js";
import { readJsonView, weiToGen } from "./genlayer.js";

// Cache keys for the official contract (the same values as before — the
// address-keyed format, so existing caches keep working). Custom contracts
// get their own keys from contract.js.
export const GRANT_CACHE_KEY = grantCacheKey(CONTRACT_ADDRESS);
export const OVERVIEW_CACHE_KEY = overviewCacheKey(CONTRACT_ADDRESS);
export const GRANT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const OVERVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
export const BATCH = 8; // 8 concurrent gen_calls: Ameer chose speed

/** Dedup + newest-first sort. The ONLY way a list reaches React state. */
export function dedupeGrants(list) {
  const byId = new Map();
  for (const g of list || []) {
    if (!g || g.id === undefined || g.id === null) continue;
    byId.set(Number(g.id), g);
  }
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

/** Merge freshly-read grants into a cached list, deduped. */
export function mergeGrants(existing, incoming) {
  return dedupeGrants([...(existing || []), ...(incoming || [])]);
}

export function loadCachedGrants(address) {
  const key = grantCacheKey(address || getActiveContract());
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { count: 0, grants: [], savedAt: null };
    const parsed = JSON.parse(raw);
    if (parsed?.savedAt && Date.now() - Number(parsed.savedAt) > GRANT_CACHE_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch {}
      return { count: 0, grants: [], savedAt: null };
    }
    const grants = dedupeGrants(Array.isArray(parsed?.grants) ? parsed.grants : []);
    return { count: Number(parsed?.count || grants.length), grants, savedAt: Number(parsed?.savedAt || 0) || null };
  } catch {
    return { count: 0, grants: [], savedAt: null };
  }
}

export function saveCachedGrants(list, count, address) {
  const key = grantCacheKey(address || getActiveContract());
  try {
    const grants = dedupeGrants(list);
    localStorage.setItem(
      key,
      JSON.stringify({
        count: Math.max(Number(count || 0), grants.length),
        grants,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Storage full or unavailable — the in-memory list still works.
  }
}

export function clearCachedGrants(address) {
  try {
    localStorage.removeItem(grantCacheKey(address || getActiveContract()));
  } catch {}
}

export function loadCachedOverview(address) {
  const key = overviewCacheKey(address || getActiveContract());
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - Number(parsed.savedAt) > OVERVIEW_CACHE_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch {}
      return null;
    }
    return parsed.overview || null;
  } catch {
    return null;
  }
}

export function saveCachedOverview(ov, address) {
  try {
    localStorage.setItem(
      overviewCacheKey(address || getActiveContract()),
      JSON.stringify({ overview: ov, savedAt: Date.now() })
    );
  } catch {}
}

// Early test-stub grants open behind a toggle, so the screen opens on
// realistic grants. The two multi-link grounding-gate grants (#0, #6) are
// the showcase grants with real MET verdicts, so they stay visible. Titles
// are immutable on-chain data — the toggle hides them from the feed, it
// does not rewrite them; the Public Ledger still lists every grant.
const TEST_GRANT_TITLE = /targeted test|cancel fix|not a real grant/i;
const SHOWCASE_GRANT_TITLE = /multi-link grounding gate/i;
export function isTestGrant(g) {
  const t = String(g?.title || "");
  if (SHOWCASE_GRANT_TITLE.test(t)) return false;
  // A grant the jury judged and paid on is a showcase record, never
  // harness noise — even when its title starts with "GrantFlow v3.4".
  // Without this, the assessed grants (#16 MET, #25 PARTIAL) would hide
  // behind the test-records toggle while "Inspect a Live AI Verdict"
  // points straight at them.
  if (hasAssessedVerdict(g)) return false;
  if (TEST_GRANT_TITLE.test(t)) return true;
  return /^GrantFlow v3\.4\b/i.test(t);
}

/**
 * A grant worth showcasing first: COMPLETE with a MET or PARTIAL verdict
 * on a milestone — the verdicts (and grounding receipts) a first-time
 * visitor should see. NOT_MET is a verdict too, but it paid nothing and
 * makes a poor first impression. A CANCELLED grant never qualifies, so the
 * feed never leads with a cancelled test grant.
 */
export function hasAssessedVerdict(g) {
  if (String(g?.status || "") !== "COMPLETE") return false;
  return (g.milestones || []).some((m) => {
    const v = m?.verdict?.verdict;
    return v === "MET" || v === "PARTIAL";
  });
}

export function filterGrants(grants, { feedFilter, showTestGrants, account }) {
  const me = (account || "").toLowerCase();
  return (grants || []).filter((g) => {
    if (!showTestGrants && isTestGrant(g)) return false;
    // FEATURED is the default feed: the showcase subset — COMPLETE with a
    // MET / PARTIAL verdict (the jury's paying verdicts). ASSESSED below is
    // the wider "any jury verdict" slice, kept for the Filter sheet.
    if (feedFilter === "FEATURED") return hasAssessedVerdict(g);
    if (feedFilter === "MINE") {
      if (!me) return false;
      return (
        String(g.grantor || "").toLowerCase() === me ||
        String(g.builder || "").toLowerCase() === me
      );
    }
    if (feedFilter === "ASSESSED") {
      return (g.milestones || []).some((m) => m.verdict);
    }
    if (feedFilter === "ACTIVE") return g.status === "FUNDED";
    if (feedFilter === "COMPLETED") return g.status === "COMPLETE" || g.status === "CANCELLED";
    return true;
  });
}

export function countGrants(grants, { showTestGrants, account }) {
  const me = (account || "").toLowerCase();
  const base = showTestGrants ? grants || [] : (grants || []).filter((g) => !isTestGrant(g));
  return {
    ALL: base.length,
    FEATURED: base.filter((g) => hasAssessedVerdict(g)).length,
    MINE: me
      ? base.filter(
          (g) =>
            String(g.grantor || "").toLowerCase() === me ||
            String(g.builder || "").toLowerCase() === me
        ).length
      : 0,
    ASSESSED: base.filter((g) => (g.milestones || []).some((m) => m.verdict)).length,
    ACTIVE: base.filter((g) => g.status === "FUNDED").length,
    COMPLETED: base.filter((g) => g.status === "COMPLETE" || g.status === "CANCELLED").length,
  };
}

/** One grant's card summary, shared by GrantCard and the "Your turn"
 *  cards in GrantList: line 3 = total GEN + a context bit (released /
 *  refunded / evidence links / files fetched) + the viewer's role.
 *  Pure data — the components render it. Amounts are GEN strings, never
 *  wei. */
export function grantCardSummary(g, account) {
  const me = (account || "").toLowerCase();
  const isGrantor = !!me && me === String(g?.grantor || "").toLowerCase();
  const isBuilder = !!me && me === String(g?.builder || "").toLowerCase();
  const safeWei = (v) => {
    try {
      return BigInt(v || "0");
    } catch {
      return 0n;
    }
  };
  const released = safeWei(g?.released_wei);
  const refunded = safeWei(g?.refunded_wei);
  const milestones = g?.milestones || [];
  const current = milestones[Number(g?.current_milestone)] || milestones[0] || null;
  const links = Array.isArray(current?.evidence?.links) ? current.evidence.links.length : 0;
  // Files the jury actually fetched: the current milestone's grounding
  // receipt first, else any milestone's.
  let fetched = null;
  const fromGrounding = (m) => {
    const n = m?.verdict?.grounding?.artifacts_fetched;
    return n !== undefined && n !== null ? Number(n) : null;
  };
  if (current) fetched = fromGrounding(current);
  if (fetched === null) {
    for (const m of milestones) {
      const n = fromGrounding(m);
      if (n !== null) {
        fetched = n;
        break;
      }
    }
  }
  const context = [];
  if (released > 0n) context.push(`${weiToGen(released)} released`);
  if (refunded > 0n) context.push(`${weiToGen(refunded)} refunded`);
  if (context.length === 0 && links > 0) context.push(`${links} evidence link${links === 1 ? "" : "s"}`);
  if (context.length === 0 && fetched !== null)
    context.push(`${fetched} file${fetched === 1 ? "" : "s"} fetched`);
  if (context.length === 0 && current)
    context.push(`Milestone ${Number(g?.current_milestone || 0) + 1}`);
  return {
    totalGen: weiToGen(g?.total_escrow_wei || "0"),
    context,
    youRole: isGrantor ? "Grantor" : isBuilder ? "Builder" : null,
  };
}

// One automatic retry, 400ms backoff, before a grant counts as failed.
// Never throws: null means "still failed after the retry".
export async function readGrantWithRetry(id) {
  try {
    const g = await readJsonView("get_grant", [id]);
    if (g) return g;
  } catch {
    // Transient failure — retry once below.
  }
  await new Promise((r) => setTimeout(r, 400));
  try {
    return await readJsonView("get_grant", [id]);
  } catch {
    return null;
  }
}

/** Newest-first ids: count-1 down to 0, at most n. */
export function newestIds(count, n) {
  return Array.from({ length: Math.min(n, count) }, (_, k) => count - 1 - k);
}
