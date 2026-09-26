import { stopPersistentBot } from "@/lib/serverBotEngine";

export const dynamic = "force-dynamic";

interface StopBody {
  walletAddress: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as StopBody;
  if (!body.walletAddress) {
    return Response.json({ error: "Missing walletAddress" }, { status: 400 });
  }
  await stopPersistentBot(body.walletAddress);
  return Response.json({ running: false });
}
