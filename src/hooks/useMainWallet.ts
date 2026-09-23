"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getInjectedProvider, type WalletKind } from "@/lib/walletProviders";
import { getClientConnection } from "@/lib/clientConnection";

interface MainWalletState {
  kind: WalletKind | null;
  publicKey: string | null;
  connecting: boolean;
  balanceSol: number | null;
  error: string | null;
}

const STORAGE_KEY = "snipe.mainWallet.kind";

export function useMainWallet() {
  const [state, setState] = useState<MainWalletState>({
    kind: null,
    publicKey: null,
    connecting: false,
    balanceSol: null,
    error: null,
  });

  const refreshBalance = useCallback(async (pubkeyStr: string) => {
    try {
      const connection = getClientConnection();
      const lamports = await connection.getBalance(new PublicKey(pubkeyStr));
      setState((s) => ({ ...s, balanceSol: lamports / 1e9 }));
    } catch {
      // ignore transient RPC failures
    }
  }, []);

  const connect = useCallback(
    async (kind: WalletKind) => {
      setState((s) => ({ ...s, connecting: true, error: null }));
      const provider = getInjectedProvider(kind);
      if (!provider) {
        setState((s) => ({
          ...s,
          connecting: false,
          error: `${kind === "phantom" ? "Phantom" : "Solflare"} extension not detected. Install it and reload.`,
        }));
        return;
      }
      try {
        const res = await provider.connect();
        const pk = res.publicKey.toString();
        localStorage.setItem(STORAGE_KEY, kind);
        setState({ kind, publicKey: pk, connecting: false, balanceSol: null, error: null });
        refreshBalance(pk);
      } catch (err) {
        setState((s) => ({
          ...s,
          connecting: false,
          error: err instanceof Error ? err.message : "Wallet connection was rejected",
        }));
      }
    },
    [refreshBalance],
  );

  const disconnect = useCallback(async () => {
    if (state.kind) {
      const provider = getInjectedProvider(state.kind);
      try {
        await provider?.disconnect();
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    setState({ kind: null, publicKey: null, connecting: false, balanceSol: null, error: null });
  }, [state.kind]);

  // Attempt silent reconnect on mount if a wallet was previously connected.
  useEffect(() => {
    const savedKind = localStorage.getItem(STORAGE_KEY) as WalletKind | null;
    if (!savedKind) return;
    const provider = getInjectedProvider(savedKind);
    if (!provider) return;
    provider
      .connect({ onlyIfTrusted: true })
      .then((res) => {
        const pk = res.publicKey.toString();
        setState({ kind: savedKind, publicKey: pk, connecting: false, balanceSol: null, error: null });
        refreshBalance(pk);
      })
      .catch(() => {
        // user hasn't trusted this app yet in the extension — require explicit click
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendSol = useCallback(
    async (toAddress: string, amountSol: number): Promise<string> => {
      if (!state.kind || !state.publicKey) throw new Error("Connect a wallet first");
      const provider = getInjectedProvider(state.kind);
      if (!provider || !provider.signAndSendTransaction) {
        throw new Error("Wallet does not support sending transactions");
      }
      const connection: Connection = getClientConnection();
      const fromPubkey = new PublicKey(state.publicKey);
      const toPubkey = new PublicKey(toAddress);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: fromPubkey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: Math.round(amountSol * 1e9),
        }),
      );
      const { signature } = await provider.signAndSendTransaction(tx);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      refreshBalance(state.publicKey);
      return signature;
    },
    [state.kind, state.publicKey, refreshBalance],
  );

  return { ...state, connect, disconnect, refreshBalance, sendSol };
}
