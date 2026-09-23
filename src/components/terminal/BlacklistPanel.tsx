"use client";

import { useState } from "react";
import { shortAddr } from "@/lib/format";

export function BlacklistPanel({
  walletAddress,
  blacklist,
  onChange,
}: {
  walletAddress: string;
  blacklist: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = async () => {
    const dev = input.trim();
    if (!dev) return;
    await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, devWallet: dev }),
    });
    onChange([...blacklist, dev]);
    setInput("");
  };

  const remove = async (dev: string) => {
    await fetch(`/api/blacklist?walletAddress=${walletAddress}&devWallet=${dev}`, { method: "DELETE" });
    onChange(blacklist.filter((d) => d !== dev));
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Deployer blacklist</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Wallet address to block"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500"
        />
        <button onClick={add} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-800">
          Block
        </button>
      </div>
      <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
        {blacklist.length === 0 && <p className="text-xs text-slate-600">No blocked deployers yet.</p>}
        {blacklist.map((dev) => (
          <div key={dev} className="flex items-center justify-between rounded-md bg-slate-950/60 px-2 py-1 text-xs">
            <span className="font-mono text-slate-400">{shortAddr(dev, 6)}</span>
            <button onClick={() => remove(dev)} className="text-rose-400 hover:underline">
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
                              }
