"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey, VersionedTransaction, type Keypair } from "@solana/web3.js";
import { pumpFeed } from "@/lib/pumpFeed";
import { getClientConnection } from "@/lib/clientConnection";
import { base64ToBytes, bytesToBase64, pollForConfirmation } from "@/lib/txUtils";
import { PUMP_FUN_TOTAL_SUPPLY, type BotConfig, type Position, type RiskAssessment, type ScannedToken, type TradeRecord } from "@/lib/types";
import type { PumpPortalNewTokenEvent, PumpPortalTradeEvent } from "@/lib/types";

const SCAN_FEED_LIMIT = 60;
const RISK_THRESHOLD: Record<BotConfig["riskTolerance"], number> = {
  low: 70,
  medium: 50,
  high: 30,
};

interface EngineArgs {
  walletAddress: string | null;
  config: BotConfig | null;
  getKeypair: () => Keypair | null;
  burnerBalanceSol: number | null;
  refreshBurnerBalance: () => Promise<void> | void;
}

function pushCapped<T>(arr: T[], item: T, cap: number): T[] {
  const next = [item, ...arr];
  return next.length > cap ? next.slice(0, cap) : next;
}

export function useBotEngine({ walletAddress, config, getKeypair, burnerBalanceSol, refreshBurnerBalance }: EngineArgs) {
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState<ScannedToken[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [solPriceUsd, setSolPriceUsd] = useState(150);
  const [blacklist, setBlacklist] = useState<string[]>([]);

  const configRef = useRef(config);
  const runningRef = useRef(false);
  const positionsRef = useRef<Position[]>([]);
  const blacklistRef = useRef<Set<string>>(new Set());
  const walletRef = useRef<string | null>(walletAddress);
  const balanceRef = useRef<number | null>(burnerBalanceSol);
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);
  useEffect(() => {
    balanceRef.current = burnerBalanceSol;
  }, [burnerBalanceSol]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);
  useEffect(() => {
    blacklistRef.current = new Set(blacklist);
  }, [blacklist]);

  const log = useCallback((message: string) => {
    setLogs((prev) => pushCapped(prev, `[${new Date().toLocaleTimeString()}] ${message}`, 200));
  }, []);

  // Load SOL/USD price periodically.
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res = await fetch("/api/sol-price");
        const data = await res.json();
        if (!cancelled && Number.isFinite(data.price)) setSolPriceUsd(data.price);
      } catch {
        // keep previous value
      }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Load persisted state (config-independent) whenever the wallet changes.
  useEffect(() => {
    if (!walletAddress) {
      setPositions([]);
      setHistory([]);
      setBlacklist([]);
      return;
    }
    (async () => {
      try {
        const [posRes, tradeRes, blRes] = await Promise.all([
          fetch(`/api/positions?walletAddress=${walletAddress}&status=open`),
          fetch(`/api/trades?walletAddress=${walletAddress}`),
          fetch(`/api/blacklist?walletAddress=${walletAddress}`),
        ]);
        const [pos, trd, bl] = await Promise.all([posRes.json(), tradeRes.json(), blRes.json()]);
        setPositions(Array.isArray(pos) ? pos : []);
        setHistory(Array.isArray(trd) ? trd : []);
        setBlacklist(Array.isArray(bl) ? bl.map((b: { devWallet: string }) => b.devWallet) : []);
      } catch {
        // non-fatal — user can retry by reloading
      }
    })();
  }, [walletAddress]);

  // Keep the feed connected as soon as the terminal mounts so the live
  // scanner panel works even before the bot is switched to "running".
  useEffect(() => {
    pumpFeed.connect();
    return () => {
      // Leave the singleton connected; other tabs/components may use it.
    };
  }, []);

  // Re-subscribe to trade updates for every currently open position so we
  // can track live price / PnL and evaluate exit conditions in real time.
  useEffect(() => {
    const mints = positions.filter((p) => p.status === "open").map((p) => p.mint);
    if (mints.length > 0) pumpFeed.subscribeTokenTrade(mints);
  }, [positions]);

  const recordTrade = useCallback(async (trade: Partial<TradeRecord> & { walletAddress: string; mint: string; side: "buy" | "sell"; amountSol: number; tokenAmount: number; priceSol: number }) => {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
      const saved = await res.json();
      setHistory((prev) => pushCapped(prev, saved, 300));
    } catch {
      // best-effort logging only
    }
  }, []);

  const executeSell = useCallback(
    async (position: Position, currentPriceSol: number, reason: string) => {
      if (inFlightRef.current.has(position.mint)) return;
      inFlightRef.current.add(position.mint);
      const cfg = configRef.current;
      try {
        log(`Selling ${position.symbol || position.mint.slice(0, 6)} — reason: ${reason}`);

        if (position.paperTrading || cfg?.paperTrading) {
          const pnlSol = position.tokenAmount * (currentPriceSol - position.entryPriceSol);
          const pnlPct = ((currentPriceSol - position.entryPriceSol) / position.entryPriceSol) * 100;
          await fetch(`/api/positions/${position.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "closed",
              closeReason: reason,
              exitPriceSol: currentPriceSol,
              realizedPnlSol: pnlSol,
              realizedPnlPct: pnlPct,
            }),
          });
          await recordTrade({
            walletAddress: position.walletAddress,
            positionId: position.id,
            mint: position.mint,
            symbol: position.symbol,
            side: "sell",
            amountSol: position.tokenAmount * currentPriceSol,
            tokenAmount: position.tokenAmount,
            priceSol: currentPriceSol,
            paperTrading: true,
            status: "confirmed",
          });
          setPositions((prev) => prev.filter((p) => p.id !== position.id));
          pumpFeed.unsubscribeTokenTrade([position.mint]);
          log(`Paper sell filled: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`);
          return;
        }

        const keypair = getKeypair();
        if (!keypair) {
          log("Cannot sell — trading wallet is locked.");
          return;
        }
        const connection = getClientConnection();
        const buildRes = await fetch("/api/trade/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: keypair.publicKey.toString(),
            action: "sell",
            mint: position.mint,
            amount: "100%",
            denominatedInSol: false,
            slippage: cfg?.slippagePct ?? 20,
            priorityFee: cfg?.priorityFeeSol ?? 0.0005,
            pool: cfg?.pool ?? "pump",
          }),
        });
        const buildData = await buildRes.json();
        if (!buildRes.ok || !buildData.transaction) {
          throw new Error(buildData.error || "Failed to build sell transaction");
        }
        const prepareRes = await fetch("/api/trade/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: buildData.transaction, publicKey: keypair.publicKey.toString() }),
        });
        const prepareData = await prepareRes.json();
        if (!prepareRes.ok || !prepareData.transaction) {
          throw new Error(prepareData.error || "Failed to prepare sell transaction");
        }
        const tx = VersionedTransaction.deserialize(base64ToBytes(prepareData.transaction));
        tx.sign([keypair]);
        const sendRes = await fetch("/api/trade/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: bytesToBase64(tx.serialize()) }),
        });
        const sendData = await sendRes.json();
        if (!sendRes.ok || !sendData.signature) {
          throw new Error(sendData.error || "Failed to send sell transaction");
        }
        const signature = sendData.signature as string;
        log(`Sell tx sent: ${signature.slice(0, 12)}…`);
        const { confirmed, error } = await pollForConfirmation(connection, signature);

        const pnlSol = position.tokenAmount * (currentPriceSol - position.entryPriceSol);
        const pnlPct = ((currentPriceSol - position.entryPriceSol) / position.entryPriceSol) * 100;

        await fetch(`/api/positions/${position.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: confirmed ? "closed" : "failed",
            closeReason: confirmed ? reason : "failed",
            sellTxSignature: signature,
            exitPriceSol: currentPriceSol,
            realizedPnlSol: pnlSol,
            realizedPnlPct: pnlPct,
          }),
        });
        await recordTrade({
          walletAddress: position.walletAddress,
          positionId: position.id,
          mint: position.mint,
          symbol: position.symbol,
          side: "sell",
          amountSol: position.tokenAmount * currentPriceSol,
          tokenAmount: position.tokenAmount,
          priceSol: currentPriceSol,
          txSignature: signature,
          status: confirmed ? "confirmed" : "failed",
          errorMessage: error ?? undefined,
        });
        setPositions((prev) => prev.filter((p) => p.id !== position.id));
        pumpFeed.unsubscribeTokenTrade([position.mint]);
        refreshBurnerBalance();
        log(
          confirmed
            ? `Sell confirmed: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`
            : `Sell may have failed: ${error}`,
        );
      } catch (err) {
        log(`Sell error: ${err instanceof Error ? err.message : "unknown error"}`);
      } finally {
        inFlightRef.current.delete(position.mint);
      }
    },
    [getKeypair, log, recordTrade, refreshBurnerBalance],
  );

  const executeBuy = useCallback(
    async (evt: PumpPortalNewTokenEvent, risk: RiskAssessment | null, amountSol: number) => {
      const cfg = configRef.current;
      if (!cfg || !walletRef.current) return;
      if (inFlightRef.current.has(evt.mint)) return;
      inFlightRef.current.add(evt.mint);
      try {
        const priceSol = evt.vSolInBondingCurve / evt.vTokensInBondingCurve;

        if (cfg.paperTrading) {
          const tokenAmount = amountSol / priceSol;
          const posRes = await fetch("/api/positions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress: walletRef.current,
              mint: evt.mint,
              symbol: evt.symbol,
              name: evt.name,
              entryAmountSol: amountSol,
              tokenAmount,
              entryPriceSol: priceSol,
              takeProfitPct: cfg.takeProfitPct,
              stopLossPct: cfg.stopLossPct,
              trailingStopPct: cfg.trailingStopPct,
              maxHoldTimeSec: cfg.maxHoldTimeSec,
              riskScore: risk?.score ?? null,
              paperTrading: true,
            }),
          });
          const saved = await posRes.json();
          setPositions((prev) => [saved, ...prev]);
          await recordTrade({
            walletAddress: walletRef.current,
            mint: evt.mint,
            symbol: evt.symbol,
            side: "buy",
            amountSol,
            tokenAmount,
            priceSol,
            paperTrading: true,
            positionId: saved.id,
            status: "confirmed",
          });
          pumpFeed.subscribeTokenTrade([evt.mint]);
          log(`[PAPER] Bought ${evt.symbol || evt.mint.slice(0, 6)} for ${amountSol.toFixed(3)} SOL`);
          return;
        }

        const keypair = getKeypair();
        if (!keypair) {
          log("Skip buy — trading wallet is locked.");
          return;
        }
        if ((balanceRef.current ?? 0) < amountSol + 0.006) {
          log(`Skip buy — trading wallet balance too low (${(balanceRef.current ?? 0).toFixed(3)} SOL).`);
          return;
        }

        const connection = getClientConnection();
        const buildRes = await fetch("/api/trade/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: keypair.publicKey.toString(),
            action: "buy",
            mint: evt.mint,
            amount: amountSol,
            denominatedInSol: true,
            slippage: cfg.slippagePct,
            priorityFee: cfg.priorityFeeSol,
            pool: cfg.pool,
          }),
        });
        const buildData = await buildRes.json();
        if (!buildRes.ok || !buildData.transaction) {
          throw new Error(buildData.error || "Failed to build buy transaction");
        }
        const prepareRes = await fetch("/api/trade/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: buildData.transaction, publicKey: keypair.publicKey.toString() }),
        });
        const prepareData = await prepareRes.json();
        if (!prepareRes.ok || !prepareData.transaction) {
          throw new Error(prepareData.error || "Failed to prepare buy transaction");
        }
        const tx = VersionedTransaction.deserialize(base64ToBytes(prepareData.transaction));
        tx.sign([keypair]);
        const sendRes = await fetch("/api/trade/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: bytesToBase64(tx.serialize()) }),
        });
        const sendData = await sendRes.json();
        if (!sendRes.ok || !sendData.signature) {
          throw new Error(sendData.error || "Failed to send buy transaction");
        }
        const signature = sendData.signature as string;
        log(`Buy tx sent for ${evt.symbol}: ${signature.slice(0, 12)}…`);
        const { confirmed, error } = await pollForConfirmation(connection, signature);

        if (!confirmed) {
          log(`Buy failed for ${evt.symbol}: ${error}`);
          await recordTrade({
            walletAddress: walletRef.current,
            mint: evt.mint,
            symbol: evt.symbol,
            side: "buy",
            amountSol,
            tokenAmount: 0,
            priceSol,
            txSignature: signature,
            status: "failed",
            errorMessage: error ?? undefined,
          });
          return;
        }

        const tokenAmount = amountSol / priceSol;
        const posRes = await fetch("/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: walletRef.current,
            mint: evt.mint,
            symbol: evt.symbol,
            name: evt.name,
            entryAmountSol: amountSol,
            tokenAmount,
            entryPriceSol: priceSol,
            takeProfitPct: cfg.takeProfitPct,
            stopLossPct: cfg.stopLossPct,
            trailingStopPct: cfg.trailingStopPct,
            maxHoldTimeSec: cfg.maxHoldTimeSec,
            riskScore: risk?.score ?? null,
            buyTxSignature: signature,
            paperTrading: false,
          }),
        });
        const saved = await posRes.json();
        setPositions((prev) => [saved, ...prev]);
        await recordTrade({
          walletAddress: walletRef.current,
          mint: evt.mint,
          symbol: evt.symbol,
          side: "buy",
          amountSol,
          tokenAmount,
          priceSol,
          txSignature: signature,
          status: "confirmed",
          positionId: saved.id,
        });
        pumpFeed.subscribeTokenTrade([evt.mint]);
        refreshBurnerBalance();
        log(`Bought ${evt.symbol || evt.mint.slice(0, 6)} for ${amountSol.toFixed(3)} SOL ✅`);
      } catch (err) {
        log(`Buy error: ${err instanceof Error ? err.message : "unknown error"}`);
      } finally {
        inFlightRef.current.delete(evt.mint);
      }
    },
    [getKeypair, log, recordTrade, refreshBurnerBalance],
  );

  const sizeForRisk = useCallback((cfg: BotConfig, score: number) => {
    switch (cfg.positionSizeMode) {
      case "random":
        return cfg.minAmountSol + Math.random() * (cfg.maxAmountSol - cfg.minAmountSol);
      case "risk_scaled":
        return cfg.minAmountSol + (cfg.maxAmountSol - cfg.minAmountSol) * (score / 100);
      default:
        return cfg.minAmountSol;
    }
  }, []);

  const evaluateNewToken = useCallback(
    async (evt: PumpPortalNewTokenEvent) => {
      const cfg = configRef.current;
      const devHoldPct = (evt.initialBuy / PUMP_FUN_TOTAL_SUPPLY) * 100;
      const liquidityUsd = evt.vSolInBondingCurve * solPriceUsd;

      const scanEntry: ScannedToken = {
        mint: evt.mint,
        name: evt.name,
        symbol: evt.symbol,
        uri: evt.uri,
        devWallet: evt.traderPublicKey,
        createdAt: Date.now(),
        marketCapSol: evt.marketCapSol,
        vSolInBondingCurve: evt.vSolInBondingCurve,
        vTokensInBondingCurve: evt.vTokensInBondingCurve,
        devHoldPct,
        liquidityUsd,
        decision: "checking",
      };
      setScanned((prev) => pushCapped(prev, scanEntry, SCAN_FEED_LIMIT));

      const patch = (patchData: Partial<ScannedToken>) => {
        setScanned((prev) => prev.map((s) => (s.mint === evt.mint ? { ...s, ...patchData } : s)));
      };

      if (!cfg || !runningRef.current) {
        patch({ decision: "skipped", skipReason: "Bot not running" });
        return;
      }

      if (cfg.useBlacklist && blacklistRef.current.has(evt.traderPublicKey)) {
        patch({ decision: "skipped", skipReason: "Blacklisted deployer wallet" });
        return;
      }
      if (positionsRef.current.length >= cfg.maxPositions) {
        patch({ decision: "skipped", skipReason: "Max concurrent positions reached" });
        return;
      }
      if (devHoldPct > cfg.maxDevHoldPct) {
        patch({ decision: "skipped", skipReason: `Dev holds ${devHoldPct.toFixed(1)}% (limit ${cfg.maxDevHoldPct}%)` });
        return;
      }
      if (liquidityUsd < cfg.minLiquidityUsd) {
        patch({ decision: "skipped", skipReason: `Liquidity $${liquidityUsd.toFixed(0)} below floor` });
        return;
      }
      if (cfg.maxLiquidityUsd > 0 && liquidityUsd > cfg.maxLiquidityUsd) {
        patch({ decision: "skipped", skipReason: `Liquidity $${liquidityUsd.toFixed(0)} above ceiling` });
        return;
      }

      let risk: RiskAssessment | null = null;
      if (cfg.honeypotDetection || cfg.rugProtection) {
        try {
          const params = new URLSearchParams({
            mint: evt.mint,
            devWallet: evt.traderPublicKey,
            walletAddress: walletRef.current ?? "",
            devHoldPct: String(devHoldPct),
            liquidityUsd: String(liquidityUsd),
            minLiquidityUsd: String(cfg.minLiquidityUsd),
            maxDevHoldPct: String(cfg.maxDevHoldPct),
          });
          const res = await fetch(`/api/risk-check?${params.toString()}`);
          risk = await res.json();
        } catch {
          risk = null;
        }
      }

      if (!runningRef.current) {
        patch({ decision: "skipped", skipReason: "Bot stopped during check" });
        return;
      }

      if (risk) {
        patch({ risk });
        const threshold = RISK_THRESHOLD[cfg.riskTolerance];
        if (risk.score < threshold) {
          patch({ decision: "skipped", skipReason: `Risk score ${risk.score} below threshold ${threshold}` });
          return;
        }
      }

      if (positionsRef.current.some((p) => p.mint === evt.mint)) {
        patch({ decision: "skipped", skipReason: "Already holding this token" });
        return;
      }

      const score = risk?.score ?? 60;
      const amountSol = Math.min(cfg.maxAmountSol, Math.max(cfg.minAmountSol, sizeForRisk(cfg, score)));
      patch({ decision: "bought" });
      await executeBuy(evt, risk, amountSol);
    },
    [executeBuy, sizeForRisk, solPriceUsd],
  );

  // Main feed listener: routes new-token events to the filter/buy pipeline
  // and trade events to live price tracking + exit logic for open positions.
  useEffect(() => {
    const unsub = pumpFeed.onEvent((event) => {
      if (event.txType === "create") {
        evaluateNewToken(event as PumpPortalNewTokenEvent).catch(() => {});
        return;
      }
      const trade = event as PumpPortalTradeEvent;
      const position = positionsRef.current.find((p) => p.mint === trade.mint && p.status === "open");
      if (!position) return;
      if (!trade.vTokensInBondingCurve || !trade.vSolInBondingCurve) return;
      const currentPriceSol = trade.vSolInBondingCurve / trade.vTokensInBondingCurve;

      setPositions((prev) =>
        prev.map((p) =>
          p.id === position.id
            ? {
                ...p,
                currentPriceSol,
                highWaterMarkPriceSol: Math.max(p.highWaterMarkPriceSol, currentPriceSol),
              }
            : p,
        ),
      );

      const pnlPct = ((currentPriceSol - position.entryPriceSol) / position.entryPriceSol) * 100;
      const hwm = Math.max(position.highWaterMarkPriceSol, currentPriceSol);
      const drawdownFromHwm = ((hwm - currentPriceSol) / hwm) * 100;

      if (pnlPct >= position.takeProfitPct) {
        executeSell(position, currentPriceSol, "take_profit");
      } else if (pnlPct <= -position.stopLossPct) {
        executeSell(position, currentPriceSol, "stop_loss");
      } else if (position.trailingStopPct > 0 && pnlPct > 0 && drawdownFromHwm >= position.trailingStopPct) {
        executeSell(position, currentPriceSol, "trailing_stop");
      }
    });
    return () => {
      unsub();
    };
  }, [evaluateNewToken, executeSell]);

  // Timeout watchdog — independent of trade events, in case a token goes
  // quiet with no further trades before the max hold time elapses.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      positionsRef.current.forEach((p) => {
        if (p.status !== "open") return;
        const ageSec = (now - new Date(p.openedAt).getTime()) / 1000;
        if (ageSec >= p.maxHoldTimeSec) {
          const price = p.currentPriceSol ?? p.entryPriceSol;
          executeSell(p, price, "timeout");
        }
      });
    }, 4000);
    return () => clearInterval(id);
  }, [executeSell]);

  const start = useCallback(async () => {
    if (!configRef.current) {
      log("Load or save a configuration before starting the bot.");
      return;
    }
    const addr = walletRef.current;
    if (addr) {
      try {
        const res = await fetch(`/api/persistent-bot/status?walletAddress=${addr}`);
        const data = await res.json();
        if (data.running) {
          log("This wallet is already running persistently on the server — stop that first if you want to run it from this tab instead.");
          return;
        }
      } catch {
        // If the status check itself fails, fall through and allow the
        // normal in-browser start rather than blocking on a network hiccup.
      }
    }
    runningRef.current = true;
    setRunning(true);
    pumpFeed.connect();
    log(configRef.current.paperTrading ? "Bot started in PAPER TRADING mode." : "Bot started — LIVE trading with real funds.");
  }, [log]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    log("Bot stopped.");
  }, [log]);

  const killSwitch = useCallback(async () => {
    stop();
    log("Kill switch engaged — closing all open positions…");
    const open = positionsRef.current.filter((p) => p.status === "open");
    for (const p of open) {
      const price = p.currentPriceSol ?? p.entryPriceSol;
      // eslint-disable-next-line no-await-in-loop
      await executeSell(p, price, "manual");
    }
  }, [executeSell, stop, log]);

  const manualSell = useCallback(
    (positionId: number) => {
      const position = positionsRef.current.find((p) => p.id === positionId);
      if (!position) return;
      executeSell(position, position.currentPriceSol ?? position.entryPriceSol, "manual");
    },
    [executeSell],
  );

  const manualBuy = useCallback(
    async (mint: string, amountSol: number) => {
      const connection = getClientConnection();
      try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(mint));
        if (!accountInfo) {
          log("Manual buy failed: mint account not found on-chain.");
          return;
        }
      } catch {
        // proceed anyway — PumpPortal will reject if the mint is invalid
      }
      const fakeEvent: PumpPortalNewTokenEvent = {
        txType: "create",
        signature: "manual",
        mint,
        traderPublicKey: "manual",
        name: "Manual snipe",
        symbol: "",
        initialBuy: 0,
        solAmount: 0,
        bondingCurveKey: "",
        vTokensInBondingCurve: 1,
        vSolInBondingCurve: 1,
        marketCapSol: 0,
      };
      await executeBuy(fakeEvent, null, amountSol);
    },
    [executeBuy, log],
  );

  return {
    running,
    scanned,
    positions,
    history,
    logs,
    solPriceUsd,
    blacklist,
    setBlacklist,
    start,
    stop,
    killSwitch,
    manualSell,
    manualBuy,
  };
}
