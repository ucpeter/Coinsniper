import { Connection } from "@solana/web3.js";

let connection: Connection | null = null;

// All RPC traffic is routed through our own /api/solana-rpc proxy so that
// an operator-configured private RPC endpoint (SOLANA_RPC_URL) can be used
// without ever exposing it to the browser, and so public rate limits are
// centralized behind one place.
export function getClientConnection(): Connection {
  if (typeof window === "undefined") {
    throw new Error("getClientConnection can only be called in the browser");
  }
  if (!connection) {
    const url = `${window.location.origin}/api/solana-rpc`;
    connection = new Connection(url, "confirmed");
  }
  return connection;
}
