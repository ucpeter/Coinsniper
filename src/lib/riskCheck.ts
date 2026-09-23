import { PublicKey } from "@solana/web3.js";
import { getServerConnection } from "./solanaServer";
import type { RiskAssessment } from "./types";

interface RiskInput {
  mint: string;
  devHoldPct: number;
  liquidityUsd: number;
  minLiquidityUsd: number;
  maxDevHoldPct: number;
  devWallet: string;
  blacklisted: boolean;
}

/**
 * Real, on-chain safety heuristics — no simulated "AI". We check the actual
 * SPL mint account for mint/freeze authority (a renounced mint authority
 * means supply cannot be inflated later; no freeze authority means the
 * token can't be frozen in holder wallets), plus dev concentration and
 * liquidity thresholds derived from the live PumpPortal event data.
 */
export async function assessTokenRisk(input: RiskInput): Promise<RiskAssessment> {
  const reasons: string[] = [];
  let mintAuthorityRenounced: boolean | null = null;
  let freezeAuthorityRenounced: boolean | null = null;

  try {
    const connection = getServerConnection();
    const mintPubkey = new PublicKey(input.mint);
    const info = await connection.getParsedAccountInfo(mintPubkey, "processed");
    const parsed = info.value?.data as
      | { parsed?: { info?: { mintAuthority?: string | null; freezeAuthority?: string | null } } }
      | undefined;
    const mintInfo = parsed?.parsed?.info;
    if (mintInfo) {
      mintAuthorityRenounced = !mintInfo.mintAuthority;
      freezeAuthorityRenounced = !mintInfo.freezeAuthority;
    }
  } catch {
    // Fresh pump.fun tokens are frequently not yet indexed by all RPCs in
    // the first instant, or the RPC rate-limited us — treat as unknown
    // rather than failing the whole check.
  }

  let score = 100;

  if (input.blacklisted) {
    score -= 100;
    reasons.push("Deployer wallet is on your blacklist");
  }

  if (mintAuthorityRenounced === false) {
    score -= 25;
    reasons.push("Mint authority not renounced — supply can be inflated");
  } else if (mintAuthorityRenounced === true) {
    reasons.push("Mint authority renounced");
  }

  if (freezeAuthorityRenounced === false) {
    score -= 25;
    reasons.push("Freeze authority active — holders' tokens could be frozen");
  } else if (freezeAuthorityRenounced === true) {
    reasons.push("Freeze authority renounced");
  }

  if (input.devHoldPct > input.maxDevHoldPct) {
    const penalty = Math.min(35, (input.devHoldPct - input.maxDevHoldPct) * 3);
    score -= penalty;
    reasons.push(
      `Deployer holds ${input.devHoldPct.toFixed(1)}% of supply (limit ${input.maxDevHoldPct}%)`,
    );
  }

  if (input.liquidityUsd < input.minLiquidityUsd) {
    score -= 20;
    reasons.push(
      `Liquidity $${input.liquidityUsd.toFixed(0)} below floor $${input.minLiquidityUsd.toFixed(0)}`,
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const verdict: RiskAssessment["verdict"] =
    score >= 70 ? "safe" : score >= 40 ? "caution" : "danger";

  return {
    score,
    verdict,
    reasons,
    mintAuthorityRenounced,
    freezeAuthorityRenounced,
    devHoldPct: input.devHoldPct,
  };
}
