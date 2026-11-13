// Contract address switching — the active contract is session-only and
// probe-first. Nothing here touches localStorage: a custom contract must
// never survive a browser restart, and it must never leak into the default
// view. The official v3.4 contract is the only default.
//
// Probe rule (verified against the contract source — GrantFlow.v3.4.py,
// get_protocol_overview, ~line 953): the overview returns name ("GrantFlow"),
// paused (boolean), owner, pending_owner, grant_count (STRING),
// total_assessed, total_assess_attempts, locked_wei, contract_balance_wei
// (all strings). There is NO total_grants and NO total_locked — any probe
// that asks for those fields is wrong and must not be used.
import { CONTRACT_ADDRESS as OFFICIAL_CONTRACT_ADDRESS } from "./config.js";

export { OFFICIAL_CONTRACT_ADDRESS };

const SESSION_KEY = "grantflow.activeContract";
const RECENTS_KEY = "grantflow.recentContracts";
const MAX_RECENTS = 3;

export function isValidAddress(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

function norm(addr) {
  return String(addr || "").trim();
}

function sessionGet(key) {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function sessionSet(key, value) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    // Private mode / storage blocked — session-only state just does not persist.
  }
}

function sessionRemove(key) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

// The address the dApp is currently reading from / writing to. Defaults to
// the official contract; a validated custom address lives only in this
// session.
export function getActiveContract() {
  const stored = sessionGet(SESSION_KEY);
  return isValidAddress(stored) ? norm(stored) : OFFICIAL_CONTRACT_ADDRESS;
}

export function setActiveContractSession(addr) {
  if (isValidAddress(addr)) sessionSet(SESSION_KEY, norm(addr));
}

export function resetActiveContractSession() {
  sessionRemove(SESSION_KEY);
}

export function isCustomContract(addr) {
  const a = norm(addr || getActiveContract()).toLowerCase();
  return a !== OFFICIAL_CONTRACT_ADDRESS.toLowerCase();
}

// Validate a get_protocol_overview result. Returns { ok, reason, version }.
// version is "v3.4" when the overview carries the v3.4-only field
// (pending_owner — two-step ownership, added in v3.4; v3.3's overview is
// otherwise identical), otherwise "older".
export function validateOverview(ov) {
  if (!ov || typeof ov !== "object") {
    return { ok: false, reason: "That address did not answer as a GrantFlow contract." };
  }
  if (ov.name !== "GrantFlow") {
    return {
      ok: false,
      reason: "That contract is not a GrantFlow — its name field is not \"GrantFlow\".",
    };
  }
  if (!("grant_count" in ov)) {
    return {
      ok: false,
      reason: "That contract does not expose a grant_count — it is not a GrantFlow contract.",
    };
  }
  if (typeof ov.paused !== "boolean") {
    return {
      ok: false,
      reason: "That contract's paused flag is not a boolean — it is not a GrantFlow contract.",
    };
  }
  if (!isValidAddress(ov.owner)) {
    return {
      ok: false,
      reason: "That contract has no readable owner address — it is not a GrantFlow contract.",
    };
  }
  const version = "pending_owner" in ov ? "v3.4" : "older";
  return { ok: true, reason: "", version };
}

// Readiness facts for the switcher strip, taken straight from a validated
// overview — never guessed.
export function readinessFromOverview(ov) {
  if (!ov) return null;
  const grantCount = Number(ov.grant_count ?? 0);
  return {
    grantCount: Number.isFinite(grantCount) ? grantCount : 0,
    owner: ov.owner || null,
    paused: ov.paused === true,
    version: validateOverview(ov).version,
  };
}

// Recent contracts — last 3 custom addresses, session-only, most recent
// first. The official address is never stored here.
export function getRecentContracts() {
  try {
    const raw = sessionGet(RECENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isValidAddress) : [];
  } catch {
    return [];
  }
}

export function addRecentContract(addr) {
  if (!isValidAddress(addr)) return;
  const a = norm(addr);
  if (a.toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) return;
  const list = [a, ...getRecentContracts().filter((x) => x.toLowerCase() !== a.toLowerCase())];
  sessionSet(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
}

// Cache keys — every on-chain cache is keyed by contract address, so
// switching contracts can never show the other contract's grants, activity
// or tx links. The formats below are the ones already on disk from the
// rebuild (hyphen style: grantflow-grants-<addr>, grantflow-overview-<addr>,
// grantflow-txlist-<addr>, grantflow-txhashes-<addr>) — the recorded-hash
// store holds exact seq→hash mappings the matcher depends on, so its key
// format is preserved exactly. Custom contracts get the same shapes with
// their own address.
export function grantCacheKey(address) {
  return `grantflow-grants-${String(address || OFFICIAL_CONTRACT_ADDRESS).toLowerCase()}`;
}

export function overviewCacheKey(address) {
  return `grantflow-overview-${String(address || OFFICIAL_CONTRACT_ADDRESS).toLowerCase()}`;
}

export function txListKey(address) {
  return `grantflow-txlist-${String(address || OFFICIAL_CONTRACT_ADDRESS).toLowerCase()}`;
}

export function recordedKey(address) {
  return `grantflow-txhashes-${String(address || OFFICIAL_CONTRACT_ADDRESS).toLowerCase()}`;
}

// Cache keys the Reload button clears: grants, overview, tx list. The
// recorded-hash store is deliberately NOT here — it holds exact write-time
// seq→hash records, not stale reads; clearing it would permanently lose
// exact links the matcher cannot re-derive.
export function reloadableCacheKeysFor(address) {
  return [grantCacheKey(address), overviewCacheKey(address), txListKey(address)];
}
