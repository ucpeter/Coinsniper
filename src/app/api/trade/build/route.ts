export const dynamic = "force-dynamic";

interface BuildBody {
  publicKey: string;
  action: "buy" | "sell";
  mint: string;
  amount: number | string;
  denominatedInSol: boolean;
  slippage: number;
  priorityFee: number;
  pool?: "pump" | "raydium" | "auto";
}

// Non-custodial: we only ever ask PumpPortal to build an UNSIGNED
// transaction for a given public key. It never sees a private key, and
// neither do we. The client deserializes and signs this with the burner
// wallet's key, which lives only in the browser.
export async function POST(req: Request) {
  const body = (await req.json()) as BuildBody;

  if (!body.publicKey || !body.action || !body.mint || !body.amount) {
    return Response.json({ error: "Missing required trade fields" }, { status: 400 });
  }

  try {
    const upstream = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: body.publicKey,
        action: body.action,
        mint: body.mint,
        amount: body.amount,
        denominatedInSol: body.denominatedInSol ? "true" : "false",
        slippage: body.slippage,
        priorityFee: body.priorityFee,
        pool: body.pool === "raydium" ? "raydium" : body.pool === "auto" ? "auto" : "pump",
      }),
    });

    if (upstream.status !== 200) {
      const message = await upstream.text();
      return Response.json({ error: message || "Failed to build transaction" }, { status: 502 });
    }

    const buf = await upstream.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return Response.json({ transaction: base64 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Trade build failed" },
      { status: 502 },
    );
  }
        }
