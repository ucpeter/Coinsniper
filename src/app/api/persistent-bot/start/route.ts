import { Keypair } from "@solana/web3.js";
import { base64ToBytes } from "@/lib/txUtils";
import { startPersistentBot } from "@/lib/serverBotEngine";

export const dynamic = "force-dynamic";

interface StartBody {
  walletAddress: string;
  secretKeyBase64: string;
}

// Receives the wallet's decrypted secret key exactly once, over HTTPS, to
// let the server keep trading with no browser tab open. The key is held
// only in this process's memory (see serverBotEngine.ts) — never written
// to the database, never logged, never persisted anywhere. It disappears
// the moment the bot is stopped, or if this server process restarts.
export async function POST(req: Request) {
  const body = (await req.json()) as StartBody;
  if (!body.walletAddress || !body.secretKeyBase64) {
    return Response.json({ error: "Missing walletAddress or secretKeyBase64" }, { status: 400 });
  }

  try {
    const keypair = Keypair.fromSecretKey(base64ToBytes(body.secretKeyBase64));
    await startPersistentBot(body.walletAddress, keypair);
    return Response.json({ running: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start persistent bot" },
      { status: 500 },
    );
  }
}￼Enter
