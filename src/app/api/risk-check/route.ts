import { assessTokenRisk } from "@/lib/riskCheck";
import { db } from "@/db";
import { blacklistedDevs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");
  const devWallet = searchParams.get("devWallet") ?? "";
  const walletAddress = searchParams.get("walletAddress") ?? "";
  const devHoldPct = Number(searchParams.get("devHoldPct") ?? "0");
  const liquidityUsd = Number(searchParams.get("liquidityUsd") ?? "0");
  const minLiquidityUsd = Number(searchParams.get("minLiquidityUsd") ?? "0");
  const maxDevHoldPct = Number(searchParams.get("maxDevHoldPct") ?? "100");

  if (!mint) {
    return Response.json({ error: "mint is required" }, { status: 400 });
  }

  let blacklisted = false;
  if (walletAddress && devWallet) {
    try {
      const rows = await db
        .select()
        .from(blacklistedDevs)
        .where(
          and(
            eq(blacklistedDevs.walletAddress, walletAddress),
            eq(blacklistedDevs.devWallet, devWallet),
          ),
        )
        .limit(1);
      blacklisted = rows.length > 0;
    } catch {
      // A database hiccup here shouldn't take down the whole risk check —
      // fall through and still return a real assessment, just without the
      // blacklist signal for this one call.
    }
  }

  const assessment = await assessTokenRisk({
    mint,
    devHoldPct,
    liquidityUsd,
    minLiquidityUsd,
    maxDevHoldPct,
    devWallet,
    blacklisted,
  });

  return Response.json(assessment);
}
