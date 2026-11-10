// GrantFlow + Public Ledger — Bradbury configuration.
// Contract: GrantFlow v3.3 on GenLayer Bradbury (chain 4221).

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x508fdD2b24F990db944Fa6aEcD590615Cfb9A183";

export const CHAIN_ID = 4221;
export const CHAIN_ID_HEX = "0x107d"; // 4221
export const CHAIN_NAME = "GenLayer Bradbury Testnet";
export const NODE_RPC_URL = "https://rpc-bradbury.genlayer.com"; // gen_call lives here
export const EXPLORER_URL = "https://explorer-bradbury.genlayer.com";
export const DOCS_URL = "https://docs.genlayer.com";

export const explorerAddressUrl = (addr) => `${EXPLORER_URL}/address/${addr}`;
export const explorerTxUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
