"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMainWallet } from "@/hooks/useMainWallet";
import { useBurnerWallet } from "@/hooks/useBurnerWallet";
import { pumpFeed, type FeedStatus } from "@/lib/pumpFeed";
import { WalletPanel } from "@/components/terminal/WalletPanel";
import { BurnerWalletPanel } from "@/components/terminal/BurnerWalletPanel";
import { WalletCockpit } from "@/components/terminal/WalletCockpit";

export default function TerminalPage() {
  const mainWallet = useMainWallet();
  const burner = useBurnerWallet();
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = pumpFeed.onStatus(setFeedStatus);
    return () => {
      unsub();
    };
  }, []);

  const unlockedWallets = burner.wallets.filter((w) => burner.unlockedIds.includes(w.id));

  // Derived, not synced: falls back to the first unlocked wallet whenever
  // activeTabId isn't (or is no longer) one of the unlocked wallets — e.g.
  // right after unlocking the first wallet, or after locking the one that
  // was active — without needing an effect to keep it in sync.
  const activeId =
    activeTabId && unlockedWallets.some((w) => w.id === activeTabId) ? activeTabId : (unlockedWallets[0]?.id ?? null);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            ⚡ Volt<span className="text-violet-400">Snipe</span>
          </Link>
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
            Real mainnet trading — you can lose all funds you deposit
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {unlockedWallets.length === 0 && (
          <div className="mb-6 rounded-xl border border-violet-800/50 bg-violet-950/20 p-4 text-sm text-violet-200">
            Unlock (or generate) a trading wallet below to load its saved configuration and start sniping. Unlock
            more than one to run them side by side, each with its own strategy.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <WalletPanel wallet={mainWallet} />
            <BurnerWalletPanel burner={burner} mainWallet={mainWallet} />
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-[11px] leading-relaxed text-slate-500">
              <p className="mb-1 font-semibold text-slate-400">How execution works</p>
              <p>
                Buys/sells are built by PumpPortal&apos;s public trade-local API, signed locally with each trading
                wallet&apos;s own key in this browser, and broadcast through our RPC proxy. We never see or store any
                private key. Every unlocked wallet below trades independently, using only its own saved
                configuration — one wallet&apos;s settings never affect another&apos;s. Trading pump.fun tokens is
                extremely high risk — most new tokens lose most of their value.
              </p>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            {unlockedWallets.length > 1 && (
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2">
                {unlockedWallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setActiveTabId(w.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      w.id === activeId
                        ? "bg-violet-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
                <span className="ml-auto self-center pr-2 text-[11px] text-slate-500">
                  All {unlockedWallets.length} keep trading in the background regardless of which tab is open
                </span>
              </div>
            )}

            {/* Every unlocked wallet's cockpit stays mounted so its bot keeps
                running even while a different tab is visible; only the
                selected one is actually shown. */}
            {unlockedWallets.map((w) => (
              <WalletCockpit
                key={w.id}
                wallet={w}
                keypair={burner.getKeypair(w.id)!}
                burnerBalanceSol={burner.balances[w.id] ?? null}
                refreshBurnerBalance={() => burner.refreshBalance(w.id)}
                feedStatus={feedStatus}
                visible={w.id === activeId}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
                }
