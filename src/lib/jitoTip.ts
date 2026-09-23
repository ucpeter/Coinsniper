// Jito's block-engine auction is paid via a plain SOL transfer to one of 8
// canonical "tip accounts." Rather than hardcoding that list (Jito has
// rotated it before, and getting even one address wrong here means real SOL
// sent to the wrong place), we ask Jito's own getTipAccounts method for the
// current list and cache it for a few minutes. If that call ever fails —
// network hiccup, endpoint change — callers fall back to skipping the tip
// rather than trusting a guessed address.

const JITO_BUNDLES_URL = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const CACHE_TTL_MS = 5 * 60_000;

let cached: { accounts: string[]; fetchedAt: number } | null = null;

async function fetchTipAccountsFromJito(): Promise<string[]> {
  const res = await fetch(JITO_BUNDLES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] }),
    // Server-side only call; keep it from hanging a trade indefinitely.
    signal: AbortSignal.timeout(2500),
  });
  const json = await res.json();
  if (!Array.isArray(json.result) || json.result.length === 0) {
    throw new Error("Jito getTipAccounts returned no accounts");
  }
  return json.result as string[];
}

/**
 * Returns one Jito tip account, refreshing the cached list from Jito every
 * few minutes. Returns null (never throws) if Jito can't be reached — the
 * caller should treat that as "skip the Jito tip for this trade" rather
 * than block the trade or fall back to a hardcoded guess.
 */
export async function getJitoTipAccount(): Promise<string | null> {
  const isStale = !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    try {
      const accounts = await fetchTipAccountsFromJito();
      cached = { accounts, fetchedAt: Date.now() };
    } catch {
      // Keep serving a stale-but-known-good cached list if we have one;
      // otherwise there's nothing safe to return.
      if (!cached) return null;
    }
  }
  if (!cached || cached.accounts.length === 0) return null;
  return cached.accounts[Math.floor(Math.random() * cached.accounts.length)];
}
