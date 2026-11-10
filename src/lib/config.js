// GrantFlow + Public Ledger — Bradbury configuration.
// Contract: GMV v2.2 (Faucet EVM-proxy _pay, Twin14 allocation). Payout proven live.
// Do NOT point this at v2.1 (0x8B96142B...) — its payout is broken and it holds
// stranded GEN — or at the StudioNet contract (different network).

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x539133B55522bD3f461F36bcA27Cf1bA9A25F5D8";

export const CHAIN_ID = 4221;
export const CHAIN_ID_HEX = "0x107d"; // 4221
export const CHAIN_NAME = "GenLayer Bradbury Testnet";
export const NODE_RPC_URL = "https://rpc-bradbury.genlayer.com"; // gen_call lives here
export const EXPLORER_URL = "https://explorer-bradbury.genlayer.com";
export const DOCS_URL = "https://docs.genlayer.com";

export const explorerAddressUrl = (addr) => `${EXPLORER_URL}/address/${addr}`;
export const explorerTxUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
