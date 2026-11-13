// Transaction links for activity entries — where a hash can honestly come from.
//
// The contract stores NO tx hash, block, or timestamp on any activity entry
// (see rebuild/tx-hash-finding.md). Hashes exist in exactly two places:
//   1. At write time in this dApp — sendWrite already returns { hash }; it is
//      persisted here, keyed by the activity seq read back after finalization.
//      Recorded hashes are EXACT and take precedence over any match.
//   2. The explorer API — https://scan.bradbury.genlayer.com/api/v1/transactions
//      lists every tx to the contract with function name + base64 calldata
//      args + timestamps. Entries match txs by (function + args + order):
//      EXACT where the args are unique, APPROXIMATE where calls repeat
//      identically (repeated assesses, no-arg withdraw/confirm/restore/sweep).
// An approximate link is always labeled "Likely transaction" — never
// presented as the exact tx. An entry with no match links to the contract
// page, with no per-entry tx claim. NEVER invent a hash. NEVER fake a link.
import { CONTRACT_ADDRESS, EXPLORER_URL, explorerTxUrl, explorerAddressUrl } from "./config.js";
import { getActiveContract, txListKey, recordedKey } from "./contract.js";

const TX_API = "/api/explorer"; // same-origin proxy (see vercel.json) —
// the explorer API sends no CORS headers, so a direct browser fetch from
// the dApp origin is blocked. The proxy forwards to
// https://scan.bradbury.genlayer.com/api/v1 unchanged.
const TXLIST_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- tx status stages -----------------------------------------------------
// Verified against the genlayer-js SDK TransactionStatus enum
// (UNINITIALIZED, PENDING, PROPOSING, COMMITTING, REVEALING, ACCEPTED,
// UNDETERMINED, FINALIZED, CANCELED, APPEAL_REVEALING, APPEAL_COMMITTING,
// VALIDATORS_TIMEOUT, LEADER_TIMEOUT, LEADER_REVEALING) and against the
// scan API, whose `status` field is the lowercase enum value — every one of
// the 336 txs on the contract so far reads "finalized", so the intermediate
// stages are only ever seen while a tx is actually in flight.
export const TX_STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];

const STAGE_BY_STATUS = {
  pending: 0,
  proposing: 1,
  committing: 2,
  revealing: 3,
  accepted: 4,
  finalized: 5,
  appeal_committing: 2,
  appeal_revealing: 3,
  leader_revealing: 3,
};

const TERMINAL_BAD_STATUSES = new Set([
  "canceled",
  "undetermined",
  "validators_timeout",
  "leader_timeout",
]);

// Index into TX_STAGES for a scan-API status, or -1 when the status is not
// a forward stage (terminal-bad, uninitialized, or unknown — the poller
// keeps the last known stage then).
export function stageIndexFor(status) {
  const s = String(status || "").toLowerCase();
  return s in STAGE_BY_STATUS ? STAGE_BY_STATUS[s] : -1;
}

export function isTerminalBadStatus(status) {
  return TERMINAL_BAD_STATUSES.has(String(status || "").toLowerCase());
}

// --- safe hrefs -----------------------------------------------------------
// Contract data (evidence links, titles) is untrusted: an evidence URL that
// is not http(s) must never become a clickable link — javascript:, data: and
// other schemes render as plain text instead.
export function safeHref(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

// function name -> activity types it can produce
const FN_TO_TYPES = {
  create_grant: ["CREATE"],
  fund_grant: ["FUND"],
  submit_evidence: ["EVIDENCE"],
  request_appeal: ["APPEAL"],
  assess_milestone: ["ASSESS", "JURY_FAILURE", "EVIDENCE_FAILURE"],
  release_tranche: ["RELEASE"],
  expire_milestone: ["EXPIRE"],
  cancel_grant: ["CANCEL"],
  withdraw_claim: ["WITHDRAW"],
  confirm_withdrawal: ["CONFIRM"],
  restore_pending: ["RESTORE"],
  sweep_excess: ["SWEEP"],
  set_paused: ["PAUSE", "RESUME"],
  transfer_ownership: ["TRANSFER_OWNERSHIP"],
  accept_ownership: ["TRANSFER_OWNERSHIP"],
};

function fnOfType(type) {
  for (const [fn, types] of Object.entries(FN_TO_TYPES)) {
    if (types.includes(type)) return fn;
  }
  return null;
}

/** Decode a tx's calldata: base64 JSON {"": "<function>", "args": [...]}.
 *  The base64 bytes are UTF-8 — atob() alone returns a Latin-1 string, so
 *  a multi-byte character (e.g. the em-dash in "Demo grant — made for this
 *  video walkthrough") comes back as mojibake ("â—") and never equals the
 *  entry's title from the contract. Decode the bytes as UTF-8 first.
 *  (Found 2026-11-11: grants 26/27 went unmatched after the RETURN filter
 *  removed the empty-title ERROR tx they had been wrongly matched to.) */
export function decodeCalldata(tx) {
  try {
    const content = tx?.data?.params?.encoded_data?.calldata?.content;
    if (!content) return null;
    const binary = atob(content);
    let text;
    try {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = binary; // not valid UTF-8 — fall back to the raw string
    }
    const json = JSON.parse(text);
    const fn = json[""];
    const args = Array.isArray(json.args) ? json.args : [];
    if (typeof fn !== "string") return null;
    return { fn, args };
  } catch {
    return null;
  }
}

/** Normalised tx for matching: { hash, fn, args, from, value, submitted, execution, validators }.
 *  `validators` is the payload's validator list (3–5 addresses, leader
 *  first) — the COUNT is real; the vote-detail fields are null, so no
 *  per-judge breakdown exists and none is ever shown. */
export function normaliseTx(tx) {
  const decoded = decodeCalldata(tx);
  if (!decoded) return null;
  return {
    hash: tx.hash,
    fn: decoded.fn,
    args: decoded.args,
    from: String(tx.from_address || "").toLowerCase(),
    value: String(tx.value || "0"),
    submitted: Number(tx.submission_timestamp || 0),
    status: tx.status,
    // Execution outcome: FINISHED_WITH_RETURN (committed), FINISHED_WITH_ERROR
    // (reverted), NONDET_DISAGREE / TIMEOUT (no consensus / no commit).
    // Only RETURN txs ever wrote to the contract's _log — see matchEntries.
    execution: tx.execution_result,
    validators: Array.isArray(tx.validators) ? tx.validators : [],
  };
}

/** Fetch every tx to the contract (paginated), cached 10 minutes.
 *  Fails gracefully: a timeout, a 5xx, or an HTML body (proxy misroute)
 *  returns whatever was collected so far (usually []) instead of throwing
 *  — the timeline keeps rendering with contract-page fallback links.
 *  `address` defaults to the active contract; the cache is keyed by it. */
export async function fetchContractTxs(address) {
  const addr = address || getActiveContract();
  const key = txListKey(addr);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.savedAt && Date.now() - Number(parsed.savedAt) < TXLIST_TTL_MS) {
        return Array.isArray(parsed.txs) ? parsed.txs : [];
      }
    }
  } catch {}
  const all = [];
  let page = 1;
  // The list is ~336 txs and grows slowly; page_size 100 keeps it to ~4 calls.
  try {
    for (let guard = 0; guard < 20; guard += 1) {
      const url = `${TX_API}/transactions?address=${addr}&page=${page}&page_size=100`;
      // 15s per page — a hung scan API must not block the timeline forever.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let res;
      try {
        res = await fetch(url, { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) break;
      const json = await res.json();
      // Envelope is { total, page, page_size, transactions } (NOT `data` —
      // verified live 2026-11-11; the `data` fallback is for safety only).
      const items = Array.isArray(json?.transactions)
        ? json.transactions
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : [];
      if (items.length === 0) break;
      for (const tx of items) {
        const n = normaliseTx(tx);
        if (n) all.push(n);
      }
      const total = Number(json?.total || 0);
      if (total > 0 && all.length >= total) break;
      if (items.length < 100) break;
      page += 1;
    }
  } catch {
    // Network error / timeout / unparseable body — return what we have.
  }
  try {
    localStorage.setItem(key, JSON.stringify({ txs: all, savedAt: Date.now() }));
  } catch {}
  return all;
}

/** One tx by hash, via the same-origin proxy — the live status the assess
 *  progress bar polls. Returns the raw tx object (with `status` and
 *  `validators`) or null when the hash is not indexed yet or the fetch
 *  fails. Never throws. */
export async function fetchTxByHash(hash) {
  if (!hash) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetch(`${TX_API}/transactions/${hash}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object" || !json.hash) return null;
    return json;
  } catch {
    return null;
  }
}

/** dApp-recorded hashes: { seq (string) -> hash }. Keyed by contract. */
export function loadRecordedHashes(address) {
  try {
    const raw = localStorage.getItem(recordedKey(address || getActiveContract()));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function recordHash(seq, hash, address) {
  if (seq === undefined || seq === null || !hash) return;
  try {
    const key = recordedKey(address || getActiveContract());
    const map = loadRecordedHashes(address);
    map[String(seq)] = hash;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

// Clear the tx-list cache for one contract (the Reload button). The
// recorded-hash store is deliberately NOT cleared — it holds exact
// write-time records, not stale reads.
export function clearTxListCache(address) {
  try {
    localStorage.removeItem(txListKey(address || getActiveContract()));
  } catch {}
}

/**
 * Do the entry's args agree with the tx's args? Used to confirm exactness.
 * grant_id is args[0] for most writes; CREATE args are [builder, title, milestonesJson].
 */
function argsAgree(entry, tx) {
  const type = entry.type || "";
  const args = tx.args || [];
  const entryGrant =
    entry.grant_id !== undefined && entry.grant_id !== null ? Number(entry.grant_id) : null;
  switch (type) {
    case "CREATE": {
      const builder = String(entry.builder || "").toLowerCase();
      const title = String(entry.title || "");
      if (args[0] && String(args[0]).toLowerCase() !== builder) return false;
      if (args[1] && String(args[1]) !== title) return false;
      // The entry also proves the milestone count + total escrow. The tx's
      // milestones JSON carries specs/deadlines the entry cannot verify, so
      // only the SUM and the COUNT are checked — two re-runs of the same
      // test (same title, same escrow) are indistinguishable by args and
      // must pair by order, never both claim one tx.
      if (args[2] && (entry.escrow_wei !== undefined || entry.milestone_count !== undefined)) {
        try {
          const ms = JSON.parse(args[2]);
          const list = Array.isArray(ms) ? ms : [];
          if (entry.milestone_count !== undefined && list.length !== Number(entry.milestone_count))
            return false;
          if (entry.escrow_wei !== undefined) {
            let sum = 0n;
            for (const m of list) {
              try {
                sum += BigInt(m.amount_wei || "0");
              } catch {
                return true; // unparseable amount — don't fail on it
              }
            }
            if (sum.toString() !== String(entry.escrow_wei)) return false;
          }
        } catch {
          // Unparseable milestones — fall back to builder + title only.
        }
      }
      return true;
    }
    case "FUND": {
      if (entryGrant !== null && Number(args[0]) !== entryGrant) return false;
      // value must equal the escrow the entry records
      if (entry.escrow_wei !== undefined && String(tx.value) !== String(entry.escrow_wei)) return false;
      return true;
    }
    case "EVIDENCE":
    case "APPEAL":
    case "RELEASE":
    case "EXPIRE":
    case "CANCEL":
    case "ASSESS":
    case "JURY_FAILURE":
    case "EVIDENCE_FAILURE":
      if (entryGrant !== null && args.length > 0 && Number(args[0]) !== entryGrant) return false;
      return true;
    case "WITHDRAW":
    case "CONFIRM":
      // No args at all — but the sender must be the entry's recipient.
      // A withdraw/confirm is always the claimant's own call, so the
      // recipient field on the entry identifies the tx's from address.
      // (This is what lets matchEntries subgroup no-arg calls by sender.)
      {
        const recipient = String(entry.recipient || "").toLowerCase();
        if (recipient && tx.from && recipient !== tx.from) return false;
      }
      return true;
    case "RESTORE": {
      const recipient = String(entry.recipient || "").toLowerCase();
      if (recipient && args[0] && String(args[0]).toLowerCase() !== recipient) return false;
      return true;
    }
    case "SWEEP":
      return true;
    case "PAUSE":
    case "RESUME": {
      const wantPaused = type === "PAUSE";
      if (args.length > 0 && Boolean(args[0]) !== wantPaused) return false;
      return true;
    }
    case "TRANSFER_OWNERSHIP": {
      // Two different txs produce this type: transfer_ownership (REQUESTED)
      // and accept_ownership (completed). The entry message carries the
      // old -> new addresses — check them, don't just check the fn: three
      // REQUESTED entries (A->B, A->C, C->A) all agreed with every
      // transfer_ownership tx under the fn-only check and all three
      // claimed the same tx.
      const msg = String(entry.message || "");
      const addrs = [...msg.matchAll(/0x[a-fA-F0-9]{40}/g)].map((x) => x[0].toLowerCase());
      const requested = msg.includes("REQUESTED");
      if (requested) {
        if (tx.fn !== "transfer_ownership") return false;
        if (addrs.length >= 2) {
          if (args[0] && String(args[0]).toLowerCase() !== addrs[1]) return false;
          if (tx.from && tx.from !== addrs[0]) return false;
        }
        return true;
      }
      // Completed: the pending (new) owner accepts — the tx has no args,
      // so the sender IS the new owner.
      if (tx.fn !== "accept_ownership") return false;
      if (addrs.length >= 2 && tx.from && tx.from !== addrs[1]) return false;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Group key for a tx: the (fn, args) projection the ENTRY can verify.
 * The full args must not be the key where they carry facts the entry
 * cannot prove — that splits indistinguishable re-runs into separate
 * 1-tx groups and lets two entries both claim one tx as "exact":
 *  - create_grant: the milestones JSON carries specs/deadlines the
 *    entry never sees; only builder + title + escrow sum + milestone
 *    count are provable from the entry.
 *  - submit_evidence: the evidence JSON is content the entry never
 *    sees; only the grant id is provable.
 *  - accept_ownership: no args at all; the sender (the new owner
 *    accepting) is the only distinguisher.
 *  - withdraw_claim / confirm_withdrawal: no args at all; the sender
 *    (the claimant) is the only distinguisher.
 */
function groupKeyFor(tx) {
  const args = tx.args || [];
  switch (tx.fn) {
    case "create_grant": {
      try {
        const ms = JSON.parse(args[2] || "[]");
        const list = Array.isArray(ms) ? ms : [];
        let sum = 0n;
        for (const m of list) {
          try {
            sum += BigInt(m.amount_wei || "0");
          } catch {
            return `create_grant::${JSON.stringify(args)}`;
          }
        }
        return `create_grant::${JSON.stringify([args[0], args[1], sum.toString(), list.length])}`;
      } catch {
        return `create_grant::${JSON.stringify(args)}`;
      }
    }
    case "submit_evidence":
      return `submit_evidence::${JSON.stringify([args[0]])}`;
    case "accept_ownership":
    case "withdraw_claim":
    case "confirm_withdrawal":
      return `${tx.fn}::${JSON.stringify([tx.from || ""])}`;
    default:
      return `${tx.fn}::${JSON.stringify(args)}`;
  }
}

/**
 * Match activity entries (any order; seq ascending is used) to txs.
 * Returns Map seq -> { hash, exact }.
 * Exact: exactly one tx in the whole list matches (fn + args the entry
 * can verify). Approximate: several txs match — the n-th entry of the
 * group links to the n-th tx of the group by submission order, labeled
 * approximate ("Likely transaction").
 *
 * Upgrades over the first version (Gemini rebuild review, verified
 * against the live explorer payload 2026-11-11 — execution_result and
 * from_address are present on every tx object):
 *  (a) Only state-committing txs are candidates. A tx that ended
 *      FINISHED_WITH_ERROR / NONDET_DISAGREE / TIMEOUT changed no state
 *      and never wrote to the contract's _log (the contract's _log only
 *      runs on the committed path; e.g. grant 15's 7 NONDET_DISAGREE + 1
 *      TIMEOUT assesses and the 38 blocked creates wrote nothing). Those
 *      txs used to pollute the groups and shift every later pairing.
 *      A tx with no execution_result field is kept (unknown, not proven
 *      uncommitted).
 *  (b) No-arg calls (withdraw_claim, confirm_withdrawal) repeat
 *      identically, so their groups are sub-grouped by sender (from) and
 *      entries match only their own recipient's txs.
 *  (c) The activity ring buffer prunes from the FRONT (oldest seqs first),
 *      so a group with more txs than surviving entries lost its OLDEST
 *      entries — the excess txs are the oldest ones and are skipped before
 *      pairing. Without this, every later entry in the group pairs one tx
 *      early (proven live: B has 12 RETURN withdraw txs but only 11
 *      surviving entries — the orphan is the earliest B withdraw tx).
 *      The label stays "Likely transaction" for all order-matched entries:
 *      the pairing is proven by elimination + order, never by args.
 *  (d) The group key is the VERIFIABLE projection (groupKeyFor), not the
 *      full args — see above. Under full-args keys, 7 hashes were shared
 *      by 2-3 entries each (all 5 ownership entries wrong or shared, the
 *      two identical "pending-withdrawal test" / "cancel test A" creates
 *      both claiming one tx, the repeated evidence submissions). One tx
 *      writes at most one entry, so a shared hash is always a wrong link.
 *  (e) A tx may be claimed by only one entry. If an entry's single
 *      candidate is already taken, the entry gets no link (contract-page
 *      fallback) rather than a second entry pointing at the same tx.
 */
export function matchEntries(entries, txs) {
  const result = new Map();
  const list = [...(entries || [])].sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  // (a) Committed txs only.
  const committed = (txs || []).filter(
    (tx) => tx.execution === undefined || tx.execution === "FINISHED_WITH_RETURN"
  );
  // Group committed txs by the verifiable (fn, args) projection, in
  // submission order.
  const groups = new Map();
  for (const tx of committed) {
    const key = groupKeyFor(tx);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  for (const g of groups.values()) g.sort((a, b) => a.submitted - b.submitted);

  // First pass: each entry's candidate txs (fn can produce the type AND
  // args agree), in submission order, plus its group key (the key of its
  // first candidate — one entry's candidates normally share one group).
  const candBySeq = new Map(); // seq -> [tx, ...]
  const keyBySeq = new Map();
  const entriesPerKey = new Map();
  for (const entry of list) {
    const seq = entry.seq;
    if (seq === undefined || seq === null) continue;
    const type = entry.type || "";
    const fns = Object.keys(FN_TO_TYPES).filter((fn) => FN_TO_TYPES[fn].includes(type));
    if (fns.length === 0) continue;
    const cands = [];
    for (const tx of committed) {
      if (!fns.includes(tx.fn)) continue;
      if (argsAgree(entry, tx)) cands.push(tx);
    }
    if (cands.length === 0) continue;
    cands.sort((a, b) => a.submitted - b.submitted);
    candBySeq.set(Number(seq), cands);
    const key = groupKeyFor(cands[0]);
    keyBySeq.set(Number(seq), key);
    entriesPerKey.set(key, (entriesPerKey.get(key) || 0) + 1);
  }

  // Second pass: pair in seq order. One candidate -> exact. Several ->
  // order within the candidate list, skipping the (c) pruned-front excess.
  const claimed = new Set();
  const keyIndex = new Map(); // group key -> entries paired so far
  for (const entry of list) {
    const seq = entry.seq;
    if (seq === undefined || seq === null) continue;
    const cands = candBySeq.get(Number(seq));
    if (!cands || cands.length === 0) continue;
    const key = keyBySeq.get(Number(seq));
    let chosen = null;
    let exact = false;
    if (cands.length === 1) {
      if (!claimed.has(cands[0].hash)) {
        chosen = cands[0];
        exact = true;
      }
    } else {
      const idx = keyIndex.get(key) || 0;
      keyIndex.set(key, idx + 1);
      const excess = Math.max(0, cands.length - (entriesPerKey.get(key) || 0));
      // Walk forward from idx + excess to the first unclaimed candidate.
      for (let i = idx + excess; i < cands.length; i++) {
        if (!claimed.has(cands[i].hash)) {
          chosen = cands[i];
          break;
        }
      }
      exact = false;
    }
    if (chosen) {
      claimed.add(chosen.hash);
      result.set(Number(seq), { hash: chosen.hash, exact, validators: chosen.validators || [] });
    }
  }
  return result;
}

/** Merge recorded hashes (exact, win) over API matches. A recorded entry
 *  keeps the validators of its tx from the API list when the hash is in
 *  it, so the jury card can still show the real validator count. */
export function mergeTxLinks(entries, txs, address) {
  const matched = matchEntries(entries, txs);
  const recorded = loadRecordedHashes(address);
  const byHash = new Map();
  for (const tx of txs || []) {
    if (tx?.hash) byHash.set(tx.hash, tx);
  }
  for (const [seq, hash] of Object.entries(recorded)) {
    const fromApi = byHash.get(hash);
    matched.set(Number(seq), {
      hash,
      exact: true,
      validators: fromApi?.validators || matched.get(Number(seq))?.validators || [],
    });
  }
  return matched;
}

/**
 * The link for one entry: { url, label, exact, validators } or the contract
 * fallback. label: "View on Explorer" (exact) | "Likely transaction"
 * (approximate). Fallback: the ACTIVE contract page, labeled "View contract
 * on Explorer". `validators` is the tx's validator list (may be empty).
 */
export function txLinkFor(entry, txLinks) {
  const seq = entry?.seq;
  const hit = seq !== undefined && seq !== null ? txLinks?.get(Number(seq)) : null;
  if (hit?.hash) {
    return {
      url: explorerTxUrl(hit.hash),
      hash: hit.hash,
      exact: !!hit.exact,
      validators: hit.validators || [],
      label: hit.exact ? "View on Explorer" : "Likely transaction",
    };
  }
  return {
    url: explorerAddressUrl(getActiveContract()),
    hash: null,
    exact: false,
    validators: [],
    label: "View contract on Explorer",
  };
}

export { EXPLORER_URL, CONTRACT_ADDRESS, explorerTxUrl, explorerAddressUrl };
