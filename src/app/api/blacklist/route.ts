import { db } from "@/db";
import { blacklistedDevs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(blacklistedDevs)
    .where(eq(blacklistedDevs.walletAddress, walletAddress));
  return Response.json(
    rows.map((r) => ({ id: r.id, devWallet: r.devWallet, reason: r.reason, createdAt: r.createdAt })),
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.walletAddress || !body.devWallet) {
    return Response.json({ error: "walletAddress and devWallet are required" }, { status: 400 });
  }
  const rows = await db
    .insert(blacklistedDevs)
    .values({
      walletAddress: body.walletAddress,
      devWallet: body.devWallet,
      reason: body.reason ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return Response.json({ ok: true, row: rows[0] ?? null });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  const devWallet = searchParams.get("devWallet");
  if (!walletAddress || !devWallet) {
    return Response.json({ error: "walletAddress and devWallet are required" }, { status: 400 });
  }
  await db
    .delete(blacklistedDevs)
    .where(
      and(
        eq(blacklistedDevs.walletAddress, walletAddress),
        eq(blacklistedDevs.devWallet, devWallet),
      ),
    );
  return Response.json({ ok: true });
}

