import { resilientRpcFetch } from "@/lib/resilientRpc";

export const dynamic = "force-dynamic";

// Generic JSON-RPC proxy so the browser never needs a hardcoded RPC key.
// Every read the client makes (balances, blockhash, signature status) goes
// through here, so this is also where the primary -> fallback -> public-RPC
// chain in resilientRpc.ts protects the app from a single provider's outage
// or rate limit taking everything down.
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const upstream = await resilientRpcFetch("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return Response.json(
      { error: { message: err instanceof Error ? err.message : "RPC proxy failed" } },
      { status: 502 },
    );
  }
}
