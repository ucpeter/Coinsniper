"use client";

// Minimal typing for the injected Solana wallet providers (Phantom /
// Solflare / Backpack, etc.) that follow the widely-adopted
// `window.solana` / `window.<wallet>` convention. We deliberately avoid a
// heavy wallet-adapter dependency tree and talk to the real injected
// extension objects directly — this is the same mechanism the wallets'
// own docs recommend for basic integrations.

export interface InjectedSolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string; toBytes(): Uint8Array } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction?: (transaction: unknown) => Promise<{ signature: string }>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    solana?: InjectedSolanaProvider;
  }
}

export type WalletKind = "phantom" | "solflare";

export function getInjectedProvider(kind: WalletKind): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  if (kind === "phantom") {
    return window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null);
  }
  if (kind === "solflare") {
    return window.solflare ?? null;
  }
  return null;
}

export function detectAvailableWallets(): WalletKind[] {
  const found: WalletKind[] = [];
  if (getInjectedProvider("phantom")) found.push("phantom");
  if (getInjectedProvider("solflare")) found.push("solflare");
  return found;
}
