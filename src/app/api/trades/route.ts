import { db } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function toClient(row: typeof trades.$inferSelect) {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    positionId: row.positionId,
    mint: row.mint,
    symbol: row.symbol,
    side: row.side,
    amountSol: Number(row.amountSol),
    tokenAmount: Number(row.tokenAmount),
    priceSol: Number(row.priceSol),
    txSignature: row.txSignature,
    status: row.status,
    paperTrading: row.paperTrading,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(trades)
    .where(eq(trades.walletAddress, walletAddress))
    .orderBy(desc(trades.createdAt))
    .limit(300);

  return Response.json(rows.map(toClient));
}

export async function POST(req: Request) {
  const body = await req.json();
  const required = ["walletAddress", "mint", "side", "amountSol", "tokenAmount", "priceSol"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null) {
      return Response.json({ error: `${key} is required` }, { status: 400 });
    }
  }

  const rows = await db
    .insert(trades)
    .values({
      walletAddress: body.walletAddress,
      positionId: body.positionId ?? null,
      mint: body.mint,
      symbol: body.symbol ?? "",
      side: body.side,
      amountSol: String(body.amountSol),
      tokenAmount: String(body.tokenAmount),
      priceSol: String(body.priceSol),
      txSignature: body.txSignature ?? null,
      status: body.status ?? "confirmed",
      paperTrading: Boolean(body.paperTrading ?? false),
      errorMessage: body.errorMessage ?? null,
    })
    .returning();

  return Response.json(toClient(rows[0]));
        }
