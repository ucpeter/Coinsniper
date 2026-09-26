export interface BuildTradeInput {
  publicKey: string;
  action: "buy" | "sell";
  mint: string;
  amount: number | string;
  denominatedInSol: boolean;
  slippage: number;
  priorityFee: number;
  pool?: "pump" | "raydium" | "auto";
}

/**
 * Asks PumpPortal's public trade-local API to build an UNSIGNED transaction
 * for the given public key. Returns it base64-encoded. Shared by the
 * /api/trade/build route (browser-driven trading) and the server-side
 * persistent bot engine (serverBotEngine.ts), so both build transactions
 * exactly the same way.
 */
export async function buildTrade(input: BuildTradeInput): Promise<string> {
  const upstream = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: input.publicKey,
      action: input.action,
      mint: input.mint,
      amount: input.amount,
      denominatedInSol: input.denominatedInSol ? "true" : "false",
      slippage: input.slippage,
      priorityFee: input.priorityFee,
      pool: input.pool === "raydium" ? "raydium" : input.pool === "auto" ? "auto" : "pump",
    }),
  });

  if (upstream.status !== 200) {
    const message = await upstream.text();
    throw new Error(message || "Failed to build transaction");
  }

  const buf = await upstream.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}
