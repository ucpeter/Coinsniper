import { buildTrade } from "@/lib/tradeBuilder";

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
    const transaction = await buildTrade(body);
    return Response.json({ transaction });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Trade build failed" },
      { status: 502 },
    );
  }
}
