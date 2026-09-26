import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botConfigs } from "@/db/schema";
import { isRunningPersistently } from "@/lib/serverBotEngine";

export const dynamic = "force-dynamic";

// The database's is_running flag is set true by /start and false by
// /stop, but it can't know about a server restart — that wipes the
// in-memory registry without going through /stop. This checks the real,
// current registry (the actual source of truth) and corrects the database
// flag if the two have drifted, so the UI never shows "running" for a bot
// whose key was actually dropped when the process restarted.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const actuallyRunning = isRunningPersistently(walletAddress);

  const rows = await db
    .select({ isRunning: botConfigs.isRunning })
    .from(botConfigs)
    .where(eq(botConfigs.walletAddress, walletAddress))
    .limit(1);

  if (rows[0]?.isRunning && !actuallyRunning) {
    await db.update(botConfigs).set({ isRunning: false }).where(eq(botConfigs.walletAddress, walletAddress));
  }

  return Response.json({ running: actuallyRunning });
}
