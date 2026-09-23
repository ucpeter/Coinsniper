// A JSON-RPC call occasionally fails not because Solana itself is down, but
// because one specific RPC provider is degraded, rate-limiting, or having
// an outage. Rather than let that take the whole app down, this tries a
// short chain of endpoints in order — your primary, then an optional
// configured backup, then the public RPC as a last resort — each with its
// own timeout, and returns the first one that actually responds.
//
// Deliberately stateless: no "is this provider currently healthy" tracking
// kept between calls. The app runs on serverless hosts (Vercel, Render)
// where in-memory state isn't reliably shared across invocations anyway —
// a fresh, independent decision on every single call is more correct here
// than a circuit breaker that could be stale by the next invocation.

const ATTEMPT_TIMEOUT_MS = 8000;
export const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";

function endpointChain(): string[] {
  const primary = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_RPC_FALLBACK;
  const secondary = process.env.SOLANA_RPC_URL_FALLBACK?.trim();
  const chain = [primary];
  if (secondary && secondary !== primary) chain.push(secondary);
  if (!chain.includes(PUBLIC_RPC_FALLBACK)) chain.push(PUBLIC_RPC_FALLBACK);
  return chain;
}

/**
 * Fetch-compatible function: retries a JSON-RPC POST against each endpoint
 * in the chain (primary -> configured fallback -> public RPC) in order,
 * moving on immediately on a timeout, network error, or non-2xx response.
 * The `info` argument (whatever URL the caller originally pointed at) is
 * intentionally ignored in favor of the chain below it, since substituting
 * a different URL on failure is the entire point.
 *
 * Pass this as the `fetch` option to a @solana/web3.js Connection to make
 * every call it makes inherit this behavior with no other code changes —
 * or call it directly, as /api/solana-rpc does.
 */
export async function resilientRpcFetch(
  _info: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const chain = endpointChain();
  let lastError: unknown = null;

  for (const url of chain) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      if (res.ok) return res;
      lastError = new Error(`${url} responded with HTTP ${res.status}`);
      // A non-2xx (429 rate-limited, 5xx, etc.) is exactly the case worth
      // failing over for — fall through to the next endpoint in the chain.
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All RPC endpoints failed");
}
