"use client";

import { useCallback, useEffect, useState } from "react";
import type { Keypair } from "@solana/web3.js";
import { useBotEngine } from "@/hooks/useBotEngine";
import type { FeedStatus } from "@/lib/pumpFeed";
import { DEFAULT_BOT_CONFIG, type BotConfig } from "@/lib/types";
import type { BurnerWalletSummary } from "@/hooks/useBurnerWallet";
import { ConfigPanel } from "@/components/terminal/ConfigPanel";
import { ControlBar } from "@/components/terminal/ControlBar";
import { LiveFeedTable } from "@/components/terminal/LiveFeedTable";
import { PositionsTable } from "@/components/terminal/PositionsTable";
import { HistoryTable } from "@/components/terminal/HistoryTable";
import { StatsBar } from "@/components/terminal/StatsBar";
import { LogPanel } from "@/components/terminal/LogPanel";
import { BlacklistPanel } from "@/components/terminal/BlacklistPanel";

/**
 * One wallet's complete trading setup: its own config (loaded/saved by its
 * own public key, so it never touches another wallet's row), its own
 * useBotEngine instance, and its own set of dashboard panels. Several of
 * these mount at once on the terminal page — one per unlocked wallet — so
 * each wallet buys/sells according to ONLY its own settings while sharing
 * nothing but the underlying token feed.
 *
 * `visible` toggles CSS display only. This must stay mounted even when
 * hidden (a background tab) — unmounting it would stop its useBotEngine
 * instance, which would stop that wallet from trading. Don't conditionally
 * render this component based on the active tab; render all of them and
 * hide the inactive ones.
 */
export function WalletCockpit({
  wallet,
  keypair,
  burnerBalanceSol,
  refreshBurnerBalance,
  feedStatus,
  visible,
}: {
  wallet: BurnerWalletSummary;
  keypair: Keypair;
  burnerBalanceSol: number | null;
  refreshBurnerBalance: () => Promise<void> | void;
  feedStatus: FeedStatus;
  visible: boolean;
}) {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const engine = useBotEngine({
    walletAddress: wallet.publicKey,
    config,
    getKeypair: () => keypair,
    burnerBalanceSol,
    refreshBurnerBalance,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bot-config?walletAddress=${wallet.publicKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setConfig({ ...DEFAULT_BOT_CONFIG, ...data });
      })
      .catch(() => {
        if (!cancelled) setConfig({ walletAddress: wallet.publicKey, ...DEFAULT_BOT_CONFIG });
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.publicKey]);

  const patchConfig = useCallback((patch: Partial<BotConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const saveConfig = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, walletAddress: wallet.publicKey }),
      });
      const saved = await res.json();
      setConfig((prev) => (prev ? { ...prev, ...saved } : prev));
    } finally {
      setSaving(false);
    }
  }, [config, wallet.publicKey]);

  const canStart = !!config && (config.paperTrading || true); // this cockpit only exists while its wallet is unlocked

  return (
    <div style={{ display: visible ? "block" : "none" }} className="space-y-4">
      {config && (
        <ControlBar
          running={engine.running}
          paperTrading={config.paperTrading}
          canStart={canStart}
          onStart={engine.start}
          onStop={engine.stop}
          onKillSwitch={engine.killSwitch}
          onManualBuy={engine.manualBuy}
        />
      )}

      <StatsBar
        history={engine.history}
        openCount={engine.positions.filter((p) => p.status === "open").length}
        solPriceUsd={engine.solPriceUsd}
      />

      <LiveFeedTable tokens={engine.scanned} feedStatus={feedStatus} />

      <div className="grid gap-4 md:grid-cols-2">
        <PositionsTable positions={engine.positions} onSell={engine.manualSell} />
        <LogPanel logs={engine.logs} />
      </div>

      <HistoryTable history={engine.history} />

      <BlacklistPanel walletAddress={wallet.publicKey} blacklist={engine.blacklist} onChange={engine.setBlacklist} />

      {config && (
        <ConfigPanel
          config={config}
          onChange={patchConfig}
          onSave={saveConfig}
          saving={saving}
          disabled={engine.running}
        />
      )}
    </div>
  );
}
