// GrantFlow + Public Ledger — Bradbury configuration.
// Contract: GrantFlow on GenLayer Bradbury (chain 4221).

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x0910f66E76a5403Cee46D44C96cC79E75C6C07eE";

// WalletConnect project ID (Reown Cloud, free project). Empty when unset —
// the wallet chooser then shows WalletConnect as unavailable instead of
// failing the build. Never hardcode a shared or demo project ID here.
export const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || "";

export const CHAIN_ID = 4221;
export const CHAIN_ID_HEX = "0x107d"; // 4221
export const CHAIN_NAME = "GenLayer Bradbury Testnet";
export const NODE_RPC_URL = "https://rpc-bradbury.genlayer.com"; // gen_call lives here
export const EXPLORER_URL = "https://scan.bradbury.genlayer.com"; // old host 301s here (verified 2026-11-11)
export const DOCS_URL = "https://docs.genlayer.com";

export const explorerAddressUrl = (addr) => `${EXPLORER_URL}/address/${addr}`;
export const explorerTxUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
