"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  clearStoredBurnerWallet,
  decryptSecretKey,
  encryptAndStoreSecretKey,
  listStoredBurnerWallets,
  type StoredBurnerWallet,
} from "@/lib/burnerCrypto";
import { getClientConnection } from "@/lib/clientConnection";

export interface BurnerWalletSummary {
  id: string;
  label: string;
  publicKey: string;
}

interface BurnerState {
  wallets: BurnerWalletSummary[];
  hasStored: boolean;
  unlockedIds: string[];
  balances: Record<string, number | null>; // keyed by wallet id
  busy: boolean;
  error: string | null;
}

function toSummaries(wallets: StoredBurnerWallet[]): BurnerWalletSummary[] {
  return wallets.map((w) => ({ id: w.id, label: w.label, publicKey: w.publicKey }));
}

/**
 * The trading ("burner") wallets. Each one's private key is generated
 * in-browser, encrypted with its own passphrase, and stored only in
 * localStorage on this device. Unlike a single-wallet setup, MULTIPLE
 * wallets can be unlocked at the same time here — that's what lets several
 * of them run their own bot instance concurrently. Every additional
 * unlocked wallet is one more decrypted private key sitting in this tab's
 * memory for as long as it stays unlocked, so only unlock the ones you're
 * actually about to run. Locking a wallet drops its decrypted key
 * immediately; the encrypted copy on disk is untouched.
 */
export function useBurnerWallet() {
  const keypairsRef = useRef<Map<string, Keypair>>(new Map());
  const [state, setState] = useState<BurnerState>({
    wallets: [],
    hasStored: false,
    unlockedIds: [],
    balances: {},
    busy: false,
    error: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncFromStorage = useCallback(() => {
    const wallets = listStoredBurnerWallets();
    setState((s) => ({ ...s, wallets: toSummaries(wallets), hasStored: wallets.length > 0 }));
  }, []);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);

  const refreshBalance = useCallback(async (id: string) => {
    const wallet = stateRef.current.wallets.find((w) => w.id === id);
    if (!wallet) return;
    try {
      const connection = getClientConnection();
      const lamports = await connection.getBalance(new PublicKey(wallet.publicKey));
      setState((s) => ({ ...s, balances: { ...s.balances, [id]: lamports / 1e9 } }));
    } catch {
      // ignore transient RPC errors — keep showing the last known balance
    }
  }, []);

  const refreshAllBalances = useCallback(() => {
    for (const w of stateRef.current.wallets) refreshBalance(w.id);
  }, [refreshBalance]);

  // Poll every stored wallet's balance (not just unlocked ones — reading a
  // balance only needs the public key) every 12s.
  useEffect(() => {
    if (state.wallets.length === 0) return;
    refreshAllBalances();
    const interval = setInterval(refreshAllBalances, 12_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.wallets.map((w) => w.id).join(","), refreshAllBalances]);

  const generate = useCallback(async (passphrase: string, label?: string) => {
    if (passphrase.length < 8) {
      setState((s) => ({ ...s, error: "Passphrase must be at least 8 characters" }));
      return;
    }
    setState((s) => ({ ...s, busy: true, error: null }));
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const id = await encryptAndStoreSecretKey(keypair.secretKey, publicKey, passphrase, label);
    keypairsRef.current.set(id, keypair);
    setState((s) => ({
      ...s,
      wallets: toSummaries(listStoredBurnerWallets()),
      hasStored: true,
      unlockedIds: [...s.unlockedIds, id],
      balances: { ...s.balances, [id]: 0 },
      busy: false,
      error: null,
    }));
  }, []);

  const unlock = useCallback(async (id: string, passphrase: string) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const secretKey = await decryptSecretKey(passphrase, id);
      const keypair = Keypair.fromSecretKey(secretKey);
      keypairsRef.current.set(id, keypair);
      setState((s) => ({ ...s, busy: false, unlockedIds: [...new Set([...s.unlockedIds, id])] }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof Error ? err.message : "Failed to unlock wallet",
      }));
    }
  }, []);

  const lock = useCallback((id: string) => {
    keypairsRef.current.delete(id);
    setState((s) => ({ ...s, unlockedIds: s.unlockedIds.filter((x) => x !== id) }));
  }, []);

  const forget = useCallback((id: string) => {
    clearStoredBurnerWallet(id);
    keypairsRef.current.delete(id);
    setState((s) => {
      const balances = { ...s.balances };
      delete balances[id];
      return {
        ...s,
        wallets: toSummaries(listStoredBurnerWallets()),
        hasStored: listStoredBurnerWallets().length > 0,
        unlockedIds: s.unlockedIds.filter((x) => x !== id),
        balances,
      };
    });
  }, []);

  const getKeypair = useCallback((id: string): Keypair | null => keypairsRef.current.get(id) ?? null, []);

  const withdrawAll = useCallback(
    async (id: string, toAddress: string): Promise<string> => {
      const keypair = keypairsRef.current.get(id);
      if (!keypair) throw new Error("Unlock this trading wallet first");
      const connection = getClientConnection();
      const lamports = await connection.getBalance(keypair.publicKey);
      const FEE_BUFFER = 5000; // lamports reserved for network fee
      const sendable = lamports - FEE_BUFFER;
      if (sendable <= 0) throw new Error("Trading wallet balance too low to withdraw");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: keypair.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(toAddress),
          lamports: sendable,
        }),
      );
      tx.sign(keypair);
      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      await refreshBalance(id);
      return signature;
    },
    [refreshBalance],
  );

  return {
    ...state,
    generate,
    unlock,
    lock,
    forget,
    getKeypair,
    refreshBalance,
    withdrawAll,
  };
}
