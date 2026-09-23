"use client";

import { useState } from "react";
import type { useMainWallet } from "@/hooks/useMainWallet";
import { fmtSol, shortAddr } from "@/lib/format";

export function WalletPanel({ wallet }: { wallet: ReturnType<typeof useMainWallet> }) {
  const [showOptions, setShowOptions] = useState(false);

  if (wallet.publicKey) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Main wallet ({wallet.kind})</p>
          <p className="font-mono text-sm text-white">{shortAddr(wallet.publicKey, 6)}</p>
          <p className="text-xs text-slate-500">{fmtSol(wallet.balanceSol)}</p>
        </div>
        <button
          onClick={wallet.disconnect}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Main wallet</p>
      {!showOptions ? (
        <button
          onClick={() => setShowOptions(true)}
          className="mt-2 w-full rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Connect wallet
        </button>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => wallet.connect("phantom")}
            disabled={wallet.connecting}
            className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Phantom
          </button>
          <button
            onClick={() => wallet.connect("solflare")}
            disabled={wallet.connecting}
            className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Solflare
          </button>
        </div>
      )}
      {wallet.error && <p className="mt-2 text-xs text-rose-400">{wallet.error}</p>}
      <p className="mt-2 text-[11px] text-slate-600">
        Non-custodial — used only to fund/withdraw the trading wallet below. We never see your keys.
      </p>
    </div>
  );
}
