import { VersionedTransaction } from "@solana/web3.js";
import { getServerConnection } from "@/lib/solanaServer";
import { broadcastSigned, readFastLaneConfig } from "@/lib/fastSend";

export const dynamic = "force-dynamic";

interface SendBody {
  transaction: string; // base64, already signed by the client's burner keypair
}

// Takes an already-signed transaction (the private key never reaches this
// route or anywhere server-side) and broadcasts it through the default RPC
// connection plus any fast-lane channel enabled in env, in parallel,
// returning whichever signature comes back first.
export async function POST(req: Request) {
  const body = (await req.json()) as SendBody;

  if (!body.transaction) {
    return Response.json({ error: "Missing transaction" }, { status: 400 });
  }

  try {
    const signedTx = VersionedTransaction.deserialize(Buffer.from(body.transaction, "base64"));
    const signature = await broadcastSigned(getServerConnection(), signedTx, readFastLaneConfig());
    return Response.json({ signature });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to broadcast transaction" },
      { status: 502 },
    );
  }
}
