hereimport { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getServerConnection } from "@/lib/solanaServer";
import { prepareForFastLane, readFastLaneConfig } from "@/lib/fastSend";

export const dynamic = "force-dynamic";

interface PrepareBody {
  transaction: string; // base64, unsigned — straight from /api/trade/build
  publicKey: string;
}

// Runs between /api/trade/build and the client signing the transaction.
// Only touches the transaction at all if a fast-lane channel is enabled in
// env; otherwise it's a pass-through. Must run before signing — adding
// instructions after signing invalidates the signature.
export async function POST(req: Request) {
  const body = (await req.json()) as PrepareBody;

  if (!body.transaction || !body.publicKey) {
    return Response.json({ error: "Missing transaction or publicKey" }, { status: 400 });
  }

  const cfg = readFastLaneConfig();
  if (!cfg.heliusSenderEnabled && !cfg.quickNodeFastlaneUrl) {
    // No fast-lane channel configured — hand the transaction back untouched.
    return Response.json({ transaction: body.transaction });
  }

  try {
    const unsignedTx = VersionedTransaction.deserialize(Buffer.from(body.transaction, "base64"));
    const prepared = await prepareForFastLane(
      getServerConnection(),
      unsignedTx,
      new PublicKey(body.publicKey),
      cfg,
    );
    return Response.json({ transaction: Buffer.from(prepared.serialize()).toString("base64") });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to prepare transaction for fast-lane submission" },
      { status: 500 },
    );
  }
}
