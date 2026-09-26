import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { botConfigs, positions, trades, blacklistedDevs } from "@/db/schema";
import { getServerFeed } from "./serverFeed";
import { getServerConnection } from "./solanaServer";
import { buildTrade } from "./tradeBuilder";
import { prepareForFastLane, broadcastSigned, readFastLaneConfig } from "./fastSend";
import { assessTokenRisk } from "./riskCheck";
import { base64ToBytes } from "./txUtils";
import { PUMP_FUN_TOTAL_SUPPLY, type BotConfig, type PumpPortalNewTokenEvent, type PumpPortalTradeEvent } from "./types";

const RISK_THRESHOLD: Record<BotConfig["riskTolerance"], number> = { low: 70, medium: 50, high: 30 };

// This engine exists specifically so a wallet keeps trading with zero
// browser tabs open. Everything it needs — the keypair, the config, open
// positions — lives only in this server process's memory or in the same
// Postgres database the browser UI already reads from, so a page opened
// later sees exactly the same positions and trade history either way.
//
// The keypair is held ONLY in the in-memory map below. It is never written
// to the database, never to disk, never logged. Stopping a bot (or the
// server process restarting for any reason) drops it immediately — trading
// then requires reconnecting and unlocking again. That's a deliberate
// limit, not a bug: persisting the raw key anywhere durable would be a
// materially worse security decision than accepting that limit.

interface OpenPosition {
  id: number;
  mint: string;
  symbol: string;
  entryAmountSol: number;
  tokenAmount: number;
  entryPriceSol: number;
  highWaterMarkPriceSol: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxHoldTimeSec: number;
  openedAtMs: number;
}

interface RunningBot {
  walletAddress: string;
  keypair: Keypair;
  config: BotConfig;
  openPositions: Map<string, OpenPosition>; // keyed by mint
  inFlight: Set<string>;
  unsubscribeFeed: () => void;
  timeoutWatchdog: ReturnType<typeof setInterval>;
  configRefresh: ReturnType<typeof setInterval>;
}

const globalForBots = globalThis as typeof globalThis & {
  __persistentBots?: Map<string, RunningBot>;
};

function registry(): Map<string, RunningBot> {
  if (!globalForBots.__persistentBots) globalForBots.__persistentBots = new Map();
  return globalForBots.__persistentBots;
}

export function isRunningPersistently(walletAddress: string): boolean {
  return registry().has(walletAddress);
}

export function listRunningWallets(): string[] {
  return [...registry().keys()];
}

// --- SOL/USD price, same 20s cache pattern as /api/sol-price ---
let priceCache: { price: number; ts: number } | null = null;
async function getSolPriceUsd(): Promise<number> {
  if (priceCache && Date.now() - priceCache.ts < 20_000) return priceCache.price;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      cache: "no-store",
    });
    const data = await res.json();
    const price = Number(data?.solana?.usd);
    if (!Number.isFinite(price)) throw new Error("bad price payload");
    priceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return priceCache?.price ?? 150;
  }
}

function sizeForRisk(cfg: BotConfig, score: number): number {
  if (cfg.positionSizeMode === "fixed") return cfg.minAmountSol;
  if (cfg.positionSizeMode === "random") {
    return cfg.minAmountSol + Math.random() * (cfg.maxAmountSol - cfg.minAmountSol);
  }
  return cfg.minAmountSol + (cfg.maxAmountSol - cfg.minAmountSol) * (score / 100);
}

async function loadConfig(walletAddress: string): Promise<BotConfig> {
  const rows = await db.select().from(botConfigs).where(eq(botConfigs.walletAddress, walletAddress)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("No saved configuration for this wallet");
  return {
    walletAddress: row.walletAddress,
    minAmountSol: Number(row.minAmountSol),
    maxAmountSol: Number(row.maxAmountSol),
    slippagePct: Number(row.slippagePct),
    priorityFeeSol: Number(row.priorityFeeSol),
    takeProfitPct: Number(row.takeProfitPct),
    stopLossPct: Number(row.stopLossPct),
    trailingStopPct: Number(row.trailingStopPct),
    maxHoldTimeSec: row.maxHoldTimeSec,
    maxDevHoldPct: Number(row.maxDevHoldPct),
    minLiquidityUsd: Number(row.minLiquidityUsd),
    maxLiquidityUsd: Number(row.maxLiquidityUsd),
    maxPositions: row.maxPositions,
    positionSizeMode: row.positionSizeMode as BotConfig["positionSizeMode"],
    riskTolerance: row.riskTolerance as BotConfig["riskTolerance"],
    pool: row.pool as BotConfig["pool"],
    autoCompound: row.autoCompound,
    useBlacklist: row.useBlacklist,
    honeypotDetection: row.honeypotDetection,
    rugProtection: row.rugProtection,
    paperTrading: row.paperTrading,
  } as BotConfig;
}

async function loadOpenPositions(walletAddress: string): Promise<Map<string, OpenPosition>> {
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.walletAddress, walletAddress), eq(positions.status, "open")));
  const map = new Map<string, OpenPosition>();
  for (const r of rows) {
    map.set(r.mint, {
      id: r.id,
      mint: r.mint,
      symbol: r.symbol,
      entryAmountSol: Number(r.entryAmountSol),
      tokenAmount: Number(r.tokenAmount),
      entryPriceSol: Number(r.entryPriceSol),
      highWaterMarkPriceSol: Number(r.highWaterMarkPriceSol),
      takeProfitPct: Number(r.takeProfitPct),
      stopLossPct: Number(r.stopLossPct),
      trailingStopPct: Number(r.trailingStopPct),
      maxHoldTimeSec: r.maxHoldTimeSec,
      openedAtMs: new Date(r.openedAt).getTime(),
    });
  }
  return map;
}

async function isBlacklisted(walletAddress: string, devWallet: string): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(blacklistedDevs)
      .where(and(eq(blacklistedDevs.walletAddress, walletAddress), eq(blacklistedDevs.devWallet, devWallet)))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function signAndSend(bot: RunningBot, unsignedTxBase64: string): Promise<string> {
  const connection = getServerConnection();
  const unsignedTx = VersionedTransaction.deserialize(base64ToBytes(unsignedTxBase64));
  const fastLaneCfg = readFastLaneConfig();
  const prepared = await prepareForFastLane(connection, unsignedTx, bot.keypair.publicKey, fastLaneCfg);
  prepared.sign([bot.keypair]);
  return broadcastSigned(connection, prepared, fastLaneCfg);
}

async function executeBuy(bot: RunningBot, evt: PumpPortalNewTokenEvent, amountSol: number, riskScore: number | null) {
  bot.inFlight.add(evt.mint);
  try {
    const unsignedTx = await buildTrade({
      publicKey: bot.keypair.publicKey.toString(),
      action: "buy",
      mint: evt.mint,
      amount: amountSol,
      denominatedInSol: true,
      slippage: bot.config.slippagePct,
      priorityFee: bot.config.priorityFeeSol,
      pool: bot.config.pool,
    });
    const signature = await signAndSend(bot, unsignedTx);
    const entryPriceSol = evt.vSolInBondingCurve / evt.vTokensInBondingCurve;
    const tokenAmount = amountSol / entryPriceSol;

    const [row] = await db
      .insert(positions)
      .values({
        walletAddress: bot.walletAddress,
        mint: evt.mint,
        symbol: evt.symbol,
        name: evt.name,
        entryAmountSol: String(amountSol),
        tokenAmount: String(tokenAmount),
        entryPriceSol: String(entryPriceSol),
        highWaterMarkPriceSol: String(entryPriceSol),
        takeProfitPct: String(bot.config.takeProfitPct),
        stopLossPct: String(bot.config.stopLossPct),
        trailingStopPct: String(bot.config.trailingStopPct),
        maxHoldTimeSec: bot.config.maxHoldTimeSec,
        riskScore,
        paperTrading: bot.config.paperTrading,
        status: "open",
        buyTxSignature: signature,
      })
      .returning();

    bot.openPositions.set(evt.mint, {
      id: row.id,
      mint: evt.mint,
      symbol: evt.symbol,
      entryAmountSol: amountSol,
      tokenAmount,
      entryPriceSol,
      highWaterMarkPriceSol: entryPriceSol,
      takeProfitPct: bot.config.takeProfitPct,
      stopLossPct: bot.config.stopLossPct,
      trailingStopPct: bot.config.trailingStopPct,
      maxHoldTimeSec: bot.config.maxHoldTimeSec,
      openedAtMs: Date.now(),
    });

    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: row.id,
      mint: evt.mint,
      symbol: evt.symbol,
      side: "buy",
      amountSol: String(amountSol),
      tokenAmount: String(tokenAmount),
      priceSol: String(entryPriceSol),
      txSignature: signature,
      status: "confirmed",
      paperTrading: bot.config.paperTrading,
    });

    getServerFeed().subscribeTokenTrade([evt.mint]);
  } catch (err) {
    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      mint: evt.mint,
      symbol: evt.symbol,
      side: "buy",
      amountSol: String(amountSol),
      tokenAmount: "0",
      priceSol: "0",
      status: "failed",
      paperTrading: bot.config.paperTrading,
      errorMessage: err instanceof Error ? err.message : "Buy failed",
    });
  } finally {
    bot.inFlight.delete(evt.mint);
  }
}

async function executeSell(
  bot: RunningBot,
  position: OpenPosition,
  currentPriceSol: number,
  reason: "take_profit" | "stop_loss" | "trailing_stop" | "timeout",
) {
  bot.inFlight.add(position.mint);
  bot.openPositions.delete(position.mint);
  try {
    const unsignedTx = await buildTrade({
      publicKey: bot.keypair.publicKey.toString(),
      action: "sell",
      mint: position.mint,
      amount: position.tokenAmount,
      denominatedInSol: false,
      slippage: bot.config.slippagePct,
      priorityFee: bot.config.priorityFeeSol,
      pool: bot.config.pool,
    });
    const signature = await signAndSend(bot, unsignedTx);
    const exitSol = position.tokenAmount * currentPriceSol;
    const realizedPnlSol = exitSol - position.entryAmountSol;
    const realizedPnlPct = (realizedPnlSol / position.entryAmountSol) * 100;

    await db
      .update(positions)
      .set({
        status: "closed",
        closeReason: reason,
        sellTxSignature: signature,
        exitPriceSol: String(currentPriceSol),
        realizedPnlSol: String(realizedPnlSol),
        realizedPnlPct: String(realizedPnlPct),
        closedAt: new Date(),
      })
      .where(eq(positions.id, position.id));

    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      side: "sell",
      amountSol: String(exitSol),
      tokenAmount: String(position.tokenAmount),
      priceSol: String(currentPriceSol),
      txSignature: signature,
      status: "confirmed",
      paperTrading: bot.config.paperTrading,
    });
  } catch (err) {
    // Put the position back — the sell attempt failed, so it's still open
    // and should keep being watched rather than silently disappearing.
    bot.openPositions.set(position.mint, position);
    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      side: "sell",
      amountSol: "0",
      tokenAmount: String(position.tokenAmount),
      priceSol: String(currentPriceSol),
      status: "failed",
      paperTrading: bot.config.paperTrading,
      errorMessage: err instanceof Error ? err.message : "Sell failed",
    });
  } finally {
    bot.inFlight.delete(position.mint);
  }
}

async function evaluateNewToken(bot: RunningBot, evt: PumpPortalNewTokenEvent) {
  const cfg = bot.config;
  if (bot.inFlight.has(evt.mint) || bot.openPositions.has(evt.mint)) return;
  if (bot.openPositions.size >= cfg.maxPositions) return;

  const devHoldPct = (evt.initialBuy / PUMP_FUN_TOTAL_SUPPLY) * 100;
  const solPriceUsd = await getSolPriceUsd();
  const liquidityUsd = evt.vSolInBondingCurve * solPriceUsd;

  if (liquidityUsd < cfg.minLiquidityUsd) return;
  if (cfg.maxLiquidityUsd > 0 && liquidityUsd > cfg.maxLiquidityUsd) return;
  if (devHoldPct > cfg.maxDevHoldPct) return;

  let riskScore: number | null = null;
  if (cfg.honeypotDetection || cfg.rugProtection) {
    const blacklisted = cfg.useBlacklist ? await isBlacklisted(bot.walletAddress, evt.traderPublicKey) : false;
    try {
      const assessment = await assessTokenRisk({
        mint: evt.mint,
        devHoldPct,
        liquidityUsd,
        minLiquidityUsd: cfg.minLiquidityUsd,
        maxDevHoldPct: cfg.maxDevHoldPct,
        devWallet: evt.traderPublicKey,
        blacklisted,
      });
      riskScore = assessment.score;
      const threshold = RISK_THRESHOLD[cfg.riskTolerance];
      if (assessment.score < threshold) return;
    } catch {
      // Same as the browser engine: a risk-check failure isn't treated as
      // an automatic pass or automatic fail here — it just skips this one
      // token rather than buying blind or crashing the loop.
      return;
    }
  }

  const amountSol = Math.min(cfg.maxAmountSol, Math.max(cfg.minAmountSol, sizeForRisk(cfg, riskScore ?? 60)));
  await executeBuy(bot, evt, amountSol, riskScore);
}

async function checkExitConditions(bot: RunningBot, mint: string, currentPriceSol: number) {
  const position = bot.openPositions.get(mint);
  if (!position || bot.inFlight.has(mint)) return;

  position.highWaterMarkPriceSol = Math.max(position.highWaterMarkPriceSol, currentPriceSol);
  const pnlPct = ((currentPriceSol - position.entryPriceSol) / position.entryPriceSol) * 100;
  const drawdownFromHwm = ((position.highWaterMarkPriceSol - currentPriceSol) / position.highWaterMarkPriceSol) * 100;

  if (pnlPct >= position.takeProfitPct) {
    await executeSell(bot, position, currentPriceSol, "take_profit");
  } else if (pnlPct <= -position.stopLossPct) {
    await executeSell(bot, position, currentPriceSol, "stop_loss");
  } else if (position.trailingStopPct > 0 && pnlPct > 0 && drawdownFromHwm >= position.trailingStopPct) {
    await executeSell(bot, position, currentPriceSol, "trailing_stop");
  }
}

async function checkTimeouts(bot: RunningBot) {
  const now = Date.now();
  for (const position of [...bot.openPositions.values()]) {
    if (bot.inFlight.has(position.mint)) continue;
    if (now - position.openedAtMs >= position.maxHoldTimeSec * 1000) {
      // Need a current price to record an accurate exit — reuse the last
      // known high-water-mark price if a trade event hasn't arrived
      // recently; this only affects the recorded exit price, not whether
      // the position closes.
      await executeSell(bot, position, position.highWaterMarkPriceSol, "timeout");
    }
  }
}

export async function startPersistentBot(walletAddress: string, keypair: Keypair): Promise<void> {
  if (keypair.publicKey.toString() !== walletAddress) {
    throw new Error("Keypair does not match the given wallet address");
  }
  if (registry().has(walletAddress)) return; // already running

  const config = await loadConfig(walletAddress);
  const openPositions = await loadOpenPositions(walletAddress);

  const feed = getServerFeed();
  feed.connect();
  if (openPositions.size > 0) feed.subscribeTokenTrade([...openPositions.keys()]);

  const bot: RunningBot = {
    walletAddress,
    keypair,
    config,
    openPositions,
    inFlight: new Set(),
    unsubscribeFeed: () => {},
    timeoutWatchdog: setInterval(() => {
      checkTimeouts(bot).catch(() => {});
    }, 10_000),
    configRefresh: setInterval(() => {
      loadConfig(walletAddress)
        .then((c) => {
          bot.config = c;
        })
        .catch(() => {});
    }, 30_000),
  };

  bot.unsubscribeFeed = feed.onEvent((event) => {
    if (event.txType === "create") {
      evaluateNewToken(bot, event as PumpPortalNewTokenEvent).catch(() => {});
    } else {
      const trade = event as PumpPortalTradeEvent;
      if (bot.openPositions.has(trade.mint)) {
        const priceSol = trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
        checkExitConditions(bot, trade.mint, priceSol).catch(() => {});
      }
    }
  });

  registry().set(walletAddress, bot);
  await db
    .update(botConfigs)
    .set({ isRunning: true, updatedAt: new Date() })
    .where(eq(botConfigs.walletAddress, walletAddress));
}

export async function stopPersistentBot(walletAddress: string): Promise<void> {
  const bot = registry().get(walletAddress);
  if (bot) {
    bot.unsubscribeFeed();
    clearInterval(bot.timeoutWatchdog);
    clearInterval(bot.configRefresh);
    registry().delete(walletAddress);
    getServerFeed().disconnectIfIdle();
  }
  await db
    .update(botConfigs)
    .set({ isRunning: false, updatedAt: new Date() })
    .where(eq(botConfigs.walletAddress, walletAddress));
}
