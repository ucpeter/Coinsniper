import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getJitoTipAccount } from "./jitoTip";

// Fast-lane submission (Helius Sender, QuickNode Transaction Fastlane) needs
// two things baked INTO the transaction before it's signed: a Jito tip
// (a plain SOL transfer to a tip account) and a competitive priority fee.
// PumpPortal's built transaction already carries whatever priority fee the
// bot's own config asked for, so we only add a ComputeBudget instruction of
// our own if PumpPortal didn't already include one — a transaction with two
// SetComputeUnitPrice instructions is rejected by the runtime, so we check
// rather than assume.
const MIN_JITO_TIP_LAMPORTS = 1_000_000; // 0.001 SOL — Sender Max / Fastlane's stated minimum
const MIN_PRIORITY_FEE_MICROLAMPORTS = 5_000_000; // Fastlane's stated minimum CU price
const COMPUTE_BUDGET_PROGRAM_ID = ComputeBudgetProgram.programId.toBase58();
const SET_COMPUTE_UNIT_PRICE_TAG = 3; // ComputeBudgetInstruction discriminant for SetComputeUnitPrice

export interface FastLaneConfig {
  heliusSenderEnabled: boolean;
  quickNodeFastlaneUrl: string | null;
  quickNodeTipAddress: string | null;
}

export function readFastLaneConfig(): FastLaneConfig {
  return {
    heliusSenderEnabled: process.env.HELIUS_SENDER_ENABLED === "true",
    quickNodeFastlaneUrl: process.env.QUICKNODE_FASTLANE_URL?.trim() || null,
    quickNodeTipAddress: process.env.QUICKNODE_FASTLANE_TIP_ADDRESS?.trim() || null,
  };
}

function hasComputeUnitPriceInstruction(instructions: TransactionInstruction[]): boolean {
  return instructions.some(
    (ix) => ix.programId.toBase58() === COMPUTE_BUDGET_PROGRAM_ID && ix.data[0] === SET_COMPUTE_UNIT_PRICE_TAG,
  );
}

/**
 * Takes the unsigned transaction PumpPortal built and, only if at least one
 * fast-lane channel is enabled, adds a Jito tip (and a QuickNode Fastlane
 * tip, if that's configured too) plus a priority-fee bump if one isn't
 * already present. Must run BEFORE the client signs — adding instructions
 * after signing would invalidate the signature. Returns the transaction
 * unchanged if no fast-lane channel is configured.
 *
 * NOTE: this decompiles and recompiles a VersionedTransaction, resolving
 * any address lookup tables it references. That round-trip is exercised
 * against PumpPortal's real output structure as far as this was checked,
 * but wasn't run against a live mainnet trade from this environment —
 * test it with a small position size before trusting it at scale.
 */
export async function prepareForFastLane(
  connection: Connection,
  unsignedTx: VersionedTransaction,
  payer: PublicKey,
  cfg: FastLaneConfig,
): Promise<VersionedTransaction> {
  const wantsFastLane = cfg.heliusSenderEnabled || !!cfg.quickNodeFastlaneUrl;
  if (!wantsFastLane) return unsignedTx;

  const message = unsignedTx.message;
  const lookupTableAccounts: AddressLookupTableAccount[] = [];
  for (const lookup of message.addressTableLookups) {
    const res = await connection.getAddressLookupTable(lookup.accountKey);
    if (res.value) lookupTableAccounts.push(res.value);
  }

  const decompiled = TransactionMessage.decompile(message, {
    addressLookupTableAccounts: lookupTableAccounts,
  });

  if (!hasComputeUnitPriceInstruction(decompiled.instructions)) {
    decompiled.instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: MIN_PRIORITY_FEE_MICROLAMPORTS }),
    );
  }

  if (cfg.heliusSenderEnabled) {
    const tipAccount = await getJitoTipAccount();
    if (tipAccount) {
      decompiled.instructions.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: new PublicKey(tipAccount),
          lamports: MIN_JITO_TIP_LAMPORTS,
        }),
      );
    }
    // If Jito's own endpoint can't be reached, Sender still gets tried —
    // just without a tip, so it competes only on its non-Jito paths.
  }

  if (cfg.quickNodeFastlaneUrl && cfg.quickNodeTipAddress) {
    decompiled.instructions.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(cfg.quickNodeTipAddress),
        lamports: MIN_JITO_TIP_LAMPORTS,
      }),
    );
  }

  const recompiled = decompiled.compileToV0Message(lookupTableAccounts);
  return new VersionedTransaction(recompiled);
}

async function sendJsonRpc(url: string, base64Tx: string, label: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method: "sendTransaction",
      params: [base64Tx, { encoding: "base64", skipPreflight: true, maxRetries: 0 }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${label}: ${json.error.message ?? JSON.stringify(json.error)}`);
  if (!json.result) throw new Error(`${label}: no signature returned`);
  return json.result as string;
}

/**
 * Broadcasts an already-signed transaction through every enabled channel
 * (the default RPC connection always; Helius Sender and/or QuickNode
 * Fastlane if configured) in parallel, and returns whichever signature
 * comes back first. Only throws if every enabled channel fails.
 */
export async function broadcastSigned(
  connection: Connection,
  signedTx: VersionedTransaction,
  cfg: FastLaneConfig,
): Promise<string> {
  const serialized = signedTx.serialize();
  const base64Tx = Buffer.from(serialized).toString("base64");

  const attempts: Promise<string>[] = [
    connection.sendRawTransaction(serialized, { skipPreflight: true, maxRetries: 3 }),
  ];
  if (cfg.heliusSenderEnabled) {
    attempts.push(sendJsonRpc("https://sender.helius-rpc.com/fast", base64Tx, "Helius Sender"));
  }
  if (cfg.quickNodeFastlaneUrl) {
    attempts.push(sendJsonRpc(cfg.quickNodeFastlaneUrl, base64Tx, "QuickNode Fastlane"));
  }

  const results = await Promise.allSettled(attempts);
  const success = results.find((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
  if (success) return success.value;
  const reasons = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  throw new Error(`All submission channels failed: ${reasons.join(" | ")}`);
}
