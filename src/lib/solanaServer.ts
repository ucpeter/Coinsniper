import { Connection } from "@solana/web3.js";
import { resilientRpcFetch } from "./resilientRpc";

// Server-side RPC endpoint. Defaults to the public Solana mainnet RPC, but
// operators can set SOLANA_RPC_URL (e.g. a Helius/QuickNode/Alchemy URL)
// via env to get a real, non-rate-limited endpoint. An optional
// SOLANA_RPC_URL_FALLBACK is tried automatically if the primary times out
// or errors — see resilientRpc.ts. This key stays server-side only — it is
// never a wallet private key, just an RPC provider credential.
export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

const globalForConn = globalThis as typeof globalThis & {
  __snipeConnection?: Connection;
};

export function getServerConnection(): Connection {
  if (!globalForConn.__snipeConnection) {
    globalForConn.__snipeConnection = new Connection(SOLANA_RPC_URL, {
      commitment: "confirmed",
      fetch: resilientRpcFetch,
    });
  }
  return globalForConn.__snipeConnection;
}
