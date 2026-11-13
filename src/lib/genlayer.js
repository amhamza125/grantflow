// GenLayer client for GrantFlow on Bradbury Phase 2 (genlayer-js 2.0.0-rc.2).
// Reads are walletless against the node RPC (the only endpoint that serves
// gen_call — the chain's default rollup RPC does not). Writes go through the
// user's injected wallet (MetaMask / Rabby) after switching it to Bradbury.
//
// PAYOUT FEES — the part that makes payouts land: only withdraw_claim and
// sweep_excess emit _pay, so only they carry the corrected external
// allocation: recipient = the payee, callKey = CALL_KEY_UNNAMED (32 zero
// bytes), budget = 0.0012 GEN = exactly 20x (gasLimit 200000 x maxGasPrice
// 300000000), feeValue = roundFees + 0.0012 GEN. Without the allocation the
// payout message is emitted but never executes — and FINISHED_WITH_RETURN does
// NOT prove a payout, only the recipient balance delta does (see
// balanceDelta). release_tranche, expire_milestone, cancel_grant and
// fund_grant only CREDIT claims (no _pay) — they use baseFees(), and the
// credit is verified by reading get_claimable afterwards.

import { createClient, encodeExternalMessageFeeParams, MessageType, CALL_KEY_UNNAMED } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createPublicClient, http, parseAbi } from "viem";
import {
  CHAIN_ID_HEX,
  CHAIN_NAME,
  NODE_RPC_URL,
  EXPLORER_URL,
  CONTRACT_ADDRESS,
} from "./config.js";
import { getActiveContract } from "./contract.js";

// --- fee policy, copied from ~/workspace/gmv-bradbury/v2/fees.json --------
// distribution.totalMessageFees is "0" there; the allocation builder below
// sets it to the payout budget (0.0012 GEN) when a _pay path needs it.
const FEE_DISTRIBUTION = {
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  appealRounds: 0n,
  executionBudgetPerRound: 25000000000000000n,
  executionConsumed: 0n,
  totalMessageFees: 0n,
  rotations: [3n],
  maxPriceGenPerTimeUnit: 2n,
  storageFeeMaxGasPrice: 300000000n,
  receiptFeeMaxGasPrice: 300000000n,
};
const BASE_FEE_VALUE = 100000000000010352n; // roundFees with zero message budget

// Payout allocation constants (see the payout-fees note above).
const PAYOUT_GAS_LIMIT = 200000n;
const PAYOUT_MAX_GAS_PRICE = 300000000n;
export const PAYOUT_BUDGET = 1200000000000000n; // 0.0012 GEN = exactly 20x gasLimit*maxGasPrice

const FEE_MANAGER_ABI = parseAbi([
  "function calculateRoundFees((uint256 leaderTimeunitsAllocation, uint256 validatorTimeunitsAllocation, uint256 appealRounds, uint256 executionBudgetPerRound, uint256 executionConsumed, uint256 totalMessageFees, uint256[] rotations, uint256 maxPriceGenPerTimeUnit, uint256 storageFeeMaxGasPrice, uint256 receiptFeeMaxGasPrice) _feesDistribution, uint256 _numOfValidators, uint256 round) view returns (uint256 totalFeesToPay)",
]);

/** Plain fees for calls that never move funds (create, submit, assess, owner). */
export function baseFees() {
  return {
    distribution: { ...FEE_DISTRIBUTION, rotations: [...FEE_DISTRIBUTION.rotations] },
    messageAllocations: [],
    feeValue: BASE_FEE_VALUE,
  };
}

/** Live roundFees from the FeeManager; falls back to the measured constant. */
async function liveRoundFees(totalMessageFees) {
  try {
    const pc = createPublicClient({ chain: testnetBradbury, transport: http(NODE_RPC_URL) });
    const distribution = {
      ...FEE_DISTRIBUTION,
      rotations: [...FEE_DISTRIBUTION.rotations],
      totalMessageFees,
    };
    const roundFees = await pc.readContract({
      address: testnetBradbury.feeManagerContract.address,
      abi: FEE_MANAGER_ABI,
      functionName: "calculateRoundFees",
      args: [distribution, 5n, 0n],
    });
    return BigInt(roundFees);
  } catch {
    return BASE_FEE_VALUE;
  }
}

/**
 * Fees for _pay-emitting calls (withdraw_claim -> the claimant,
 * sweep_excess -> the owner). Every other write credits claims instead of
 * paying inline, so it uses baseFees().
 */
export async function payoutFees(payee) {
  const roundFees = await liveRoundFees(PAYOUT_BUDGET);
  const feeParams = encodeExternalMessageFeeParams({
    gasLimit: PAYOUT_GAS_LIMIT,
    maxGasPrice: PAYOUT_MAX_GAS_PRICE,
  });
  return {
    distribution: {
      ...FEE_DISTRIBUTION,
      rotations: [...FEE_DISTRIBUTION.rotations],
      totalMessageFees: PAYOUT_BUDGET,
    },
    messageAllocations: [
      {
        messageType: MessageType.External,
        onAcceptance: false,
        parentIndex: (1n << 256n) - 1n, // root
        recipient: payee,
        callKey: CALL_KEY_UNNAMED, // bare transfer: empty calldata -> zero key
        budget: PAYOUT_BUDGET,
        feeParams,
      },
    ],
    feeValue: roundFees + PAYOUT_BUDGET,
  };
}

// --- wallet ---------------------------------------------------------------
// The active EIP-1193 provider. Injected wallets (window.ethereum or an
// EIP-6963 provider) and WalletConnect both plug in here — writes never
// assume window.ethereum. Defaults to window.ethereum when nothing was
// chosen, so the old injected-only path keeps working.
let activeProvider = null;
export function setWalletProvider(p) {
  activeProvider = p || null;
}
export function walletProvider() {
  return activeProvider || (typeof window !== "undefined" ? window.ethereum : null);
}

export async function connectWallet(provider) {
  const eth = provider || walletProvider();
  if (!eth) {
    throw new Error("No EVM wallet detected. Install MetaMask or Rabby first.");
  }
  // ORDER MATTERS — accounts FIRST, chain switch second. OKX (and other
  // in-app wallet browsers) require the site to be CONNECTED before any
  // other request: a chain-switch call from an unauthorised site is
  // silently dropped — no prompt, no error, the promise never settles.
  // The old code switched chain first, which is exactly the hang Ameer
  // filmed in the OKX app: "Connecting…" forever, no approval ever
  // appearing. MetaMask happens to tolerate switch-first; OKX does not.
  const accounts = await requestWithTimeout(eth, "eth_requestAccounts", null, "accounts");
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts authorized in wallet.");
  }
  try {
    await requestWithTimeout(eth, "wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }], "chain switch");
  } catch (err) {
    // OKX Mobile (some versions) wraps an unrecognised custom chain in a
    // nested provider error instead of the standard EIP-3085 code 4902:
    // error.code -32603, or error.data.originalError.code 4902, or a
    // message containing "Unrecognized chain ID" / "chainId". All of them
    // mean the same thing — the chain is not added yet — so they all
    // trigger wallet_addEthereumChain. (Gemini review, 2026-11-11.)
    const code = err && err.code;
    const nestedCode = err && err.data && err.data.originalError && err.data.originalError.code;
    const msg = (err && err.message) || "";
    const chainNotAdded =
      code === 4902 ||
      code === -32603 ||
      nestedCode === 4902 ||
      /unrecognized chain|chain.*not added|4902/i.test(msg);
    if (chainNotAdded) {
      await requestWithTimeout(
        eth,
        "wallet_addEthereumChain",
        [
          {
            chainId: CHAIN_ID_HEX,
            chainName: CHAIN_NAME,
            rpcUrls: [NODE_RPC_URL],
            nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
        "add chain"
      );
    } else {
      throw err;
    }
  }
  return accounts[0];
}

// A hung provider request must surface, never hang the tap: every wallet
// call races a timeout with a step-specific error, so the user learns
// WHICH step never answered instead of a generic 25s "did not respond".
function requestWithTimeout(provider, method, params, stepLabel, timeoutMs = 12000) {
  return Promise.race([
    provider.request(params ? { method, params } : { method }),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `The wallet did not answer the ${stepLabel} request. No approval appeared — the wallet may be locked, or the request was blocked. Try again.`
            )
          ),
        timeoutMs
      )
    ),
  ]);
}

// --- clients --------------------------------------------------------------
export function readClient() {
  return createClient({ chain: testnetBradbury, endpoint: NODE_RPC_URL });
}

export function writeClient(account) {
  return createClient({ chain: testnetBradbury, account, provider: walletProvider() });
}

// --- reads ----------------------------------------------------------------
export function parseResult(raw) {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

export function parseJson(raw) {
  const s = parseResult(raw);
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// A read of a contract view method. `address` defaults to the active
// contract (official v3.4, or the custom contract the user switched to this
// session). Reads are safe against any address — the probe uses this.
export async function readView(functionName, args = [], address) {
  const client = readClient();
  return client.readContract({ address: address || getActiveContract(), functionName, args });
}

export async function readJsonView(functionName, args = [], address) {
  return parseJson(await readView(functionName, args, address));
}

export async function ethBalance(address) {
  const r = await fetch(NODE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  const j = await r.json();
  if (typeof j.result !== "string") throw new Error("eth_getBalance failed");
  return BigInt(j.result);
}

/** GEN the contract owes this address (release / expiry / cancel credits). "0" when none. */
export async function getClaimable(address) {
  const v = await readJsonView("get_claimable", [address]);
  try {
    return BigInt(v ?? "0");
  } catch {
    return 0n;
  }
}

/**
 * An in-flight withdrawal for this address, or null. The contract returns
 * "NONE" when there is none, else { amount_wei, initiated_at }.
 */
export async function getPending(address) {
  const v = await readJsonView("get_pending", [address]);
  if (!v || typeof v !== "object") return null;
  try {
    if (BigInt(v.amount_wei || "0") <= 0n) return null;
  } catch {
    return null;
  }
  return v;
}

// --- writes ---------------------------------------------------------------
/**
 * Send a write and wait for FINALIZED consensus.
 * `fees` must be payoutFees(payee) for _pay-emitting calls, baseFees() otherwise.
 * `opts.address` — the contract to write to (defaults to the active contract).
 * `opts.onHash` — called with the tx hash as soon as the wallet returns it,
 *   BEFORE the receipt wait, so the caller can start live progress tracking
 *   while consensus runs (an assess takes minutes).
 * Resolves with { hash, receipt }. Throws with a readable message on failure.
 */
export async function sendWrite(account, functionName, args = [], value = 0n, fees = null, opts = {}) {
  const client = writeClient(account);
  const hash = await client.writeContract({
    address: opts.address || getActiveContract(),
    functionName,
    args,
    value,
    fees: fees || baseFees(),
  });
  if (typeof opts.onHash === "function") {
    try {
      opts.onHash(hash);
    } catch {
      // A progress hook must never break the write.
    }
  }
  let receipt = null;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash,
      waitUntil: "finalized",
      retries: 360,
      interval: 5000,
    });
  } catch {
    // Receipt polling can time out on slow consensus; the tx hash is still
    // usable in the explorer, so don't fail the whole flow here.
  }
  if (receipt) {
    // Normalize the execution outcome: the SDK puts it in
    // txExecutionResultName; resultName is the consensus outcome
    // (e.g. MAJORITY_AGREE) and must NOT be read as the execution result.
    receipt.execName = receipt.txExecutionResultName || receipt.execName || null;
    receipt.statusName = receipt.statusName || receipt.status_name || null;
  }
  return { hash, receipt };
}

/**
 * A FINISHED_WITH_RETURN receipt does NOT prove a payout.
 * Only the recipient's balance delta does. Call with balances read before
 * and after the tx to get { before, after, deltaWei, landed }.
 */
export async function balanceDelta(address, beforeWei) {
  const after = await ethBalance(address);
  const delta = after - beforeWei;
  return { before: beforeWei, after, deltaWei: delta, landed: delta !== 0n };
}

// --- formatting helpers ---------------------------------------------------
export function shortAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function genToWei(gen) {
  const s = String(gen).trim();
  if (!s || Number.isNaN(Number(s)) || Number(s) <= 0) {
    throw new Error("Enter a GEN amount greater than 0.");
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}

export function weiToGen(wei) {
  try {
    const w = BigInt(wei);
    const whole = w / 10n ** 18n;
    const frac = w % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

export function friendlyError(err) {
  const msg = (err && (err.shortMessage || err.message)) || "Transaction failed.";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

export { CONTRACT_ADDRESS, TransactionStatus };
