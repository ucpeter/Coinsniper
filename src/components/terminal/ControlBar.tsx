"use client";

import { useState } from "react";

interface Props {
  running: boolean;
  paperTrading: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onKillSwitch: () => void;
  onManualBuy: (mint: string, amountSol: number) => void;
}

export function ControlBar({ running, paperTrading, canStart, onStart, onStop, onKillSwitch, onManualBuy }: Props) {
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("0.05");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
              paperTrading ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {paperTrading ? "▶ Start (paper trading)" : "▶ Start LIVE sniping"}
          </button>
        ) : (
          <button
            onClick={onStop}
            className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            ⏸ Stop bot
          </button>
        )}
        <button
          onClick={onKillSwitch}
          className="rounded-lg border border-rose-800 px-4 py-2 text-sm font-semibold text-rose-400 hover:bg-rose-950/40"
        >
          🛑 Kill switch (sell everything)
        </button>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            running
              ? paperTrading
                ? "bg-amber-500/15 text-amber-400"
                : "bg-emerald-500/15 text-emerald-400"
              : "bg-slate-800 text-slate-500"
          }`}
        >
          {running ? (paperTrading ? "PAPER MODE RUNNING" : "LIVE — real funds at risk") : "STOPPED"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
        <span className="text-xs text-slate-500">Manual snipe:</span>
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Token mint address"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          step="0.01"
          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500"
        />
        <button
          onClick={() => mint && onManualBuy(mint.trim(), Number(amount))}
          disabled={!canStart || !mint}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Buy now
        </button>
      </div>
    </div>
  );
}
