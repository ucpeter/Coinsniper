export const dynamic = "force-dynamic";

let cached: { price: number; ts: number } | null = null;
const CACHE_MS = 20_000;

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return Response.json({ price: cached.price, cached: true });
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { cache: "no-store" },
    );
    const data = await res.json();
    const price = Number(data?.solana?.usd);
    if (!Number.isFinite(price)) throw new Error("bad price payload");
    cached = { price, ts: Date.now() };
    return Response.json({ price, cached: false });
  } catch {
    // Fall back to the last known good price, or a conservative default.
    const price = cached?.price ?? 150;
    return Response.json({ price, cached: true, stale: true });
  }
}
