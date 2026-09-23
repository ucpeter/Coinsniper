"use client";

import { useState } from "react";
import type { useBurnerWallet, BurnerWalletSummary } from "@/hooks/useBurnerWallet";
import type { useMainWallet } from "@/hooks/useMainWallet";
import { fmtSol, shortAddr } from "@/lib/format";

type Burner = ReturnType<typeof useBurnerWallet>;
type MainWallet = ReturnType<typeof useMainWallet>;

function WalletCard({
  wallet,
  unlocked,
  balanceSol,
  mainWallet,
  onUnlock,
  onLock,
  onForget,
  onFund,
  onWithdraw,
}: {
  wallet: BurnerWalletSummary;
  unlocked: boolean;
  balanceSol: number | null;
  mainWallet: MainWallet;
  onUnlock: (passphrase: string) => Promise<void>;
  onLock: () => void;
  onForget: () => void;
  onFund: (amountSol: number) => Promise<void>;
  onWithdraw: () => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [fundAmount, setFundAmount] = useState("0.2");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{wallet.label}</p>
        {unlocked ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            UNLOCKED · TRADING
          </span>
        ) : (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            LOCKED
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-xs text-slate-400">{shortAddr(wallet.publicKey, 6)}</p>
      <p className="text-xs text-slate-500">{fmtSol(balanceSol)}</p>

      {!unlocked ? (
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500"
          />
          <button
            disabled={busyAction === "unlock" || !passphrase}
            onClick={() =>
              runAction("unlock", async () => {
                await onUnlock(passphrase);
                setPassphrase("");
              })
            }
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Unlock
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500"
            />
            <button
              disabled={!mainWallet.publicKey || busyAction === "fund"}
              onClick={() => runAction("fund", () => onFund(Number(fundAmount)))}
              className="flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Fund
            </button>
            <button
              disabled={!mainWallet.publicKey || busyAction === "withdraw"}
              onClick={() => runAction("withdraw", onWithdraw)}
              className="flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Withdraw all
            </button>
          </div>
          <div className="flex gap-2 text-[11px]">
            <button onClick={onLock} className="flex-1 rounded-lg border border-slate-800 px-2 py-1 text-slate-400 hover:bg-slate-800">
              Lock
            </button>
            <button
              onClick={() => {
                if (confirm("This permanently deletes the encrypted key from this device. Withdraw funds first. Continue?")) {
                  onForget();
                }
              }}
              className="flex-1 rounded-lg border border-rose-900 px-2 py-1 text-rose-400 hover:bg-rose-950/40"
            >
              Forget
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-[11px] text-rose-400">{message}</p>}
    </div>
  );
}

export function BurnerWalletPanel({ burner, mainWallet }: { burner: Burner; mainWallet: MainWallet }) {
  const [newLabel, setNewLabel] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [generating, setGenerating] = useState(false);

  const noWallets = !burner.hasStored;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">Trading wallets</p>
        {burner.unlockedIds.length > 1 && (
          <span className="text-[10px] font-semibold text-emerald-400">
            {burner.unlockedIds.length} running concurrently
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Each wallet is generated in your browser and encrypted with its own passphrase, stored only on this device —
        never sent to our server. Unlock as many as you want to run at once; each one trades independently using its
        own saved configuration.
      </p>

      {burner.wallets.length > 0 && (
        <div className="mt-3 space-y-2">
          {burner.wallets.map((w) => (
            <WalletCard
              key={w.id}
              wallet={w}
              unlocked={burner.unlockedIds.includes(w.id)}
              balanceSol={burner.balances[w.id] ?? null}
              mainWallet={mainWallet}
              onUnlock={(passphrase) => burner.unlock(w.id, passphrase)}
              onLock={() => burner.lock(w.id)}
              onForget={() => burner.forget(w.id)}
              onFund={async (amountSol) => {
                await mainWallet.sendSol(w.publicKey, amountSol);
                await burner.refreshBalance(w.id);
              }}
              onWithdraw={async () => {
                if (!mainWallet.publicKey) return;
                await burner.withdrawAll(w.id, mainWallet.publicKey);
              }}
            />
          ))}
        </div>
      )}

      {(noWallets || showAddForm) && (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-700 p-3">
          <input
            type="text"
            placeholder="Label (optional, e.g. Main sniper)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
          />
          <input
            type="password"
            placeholder="Choose a passphrase (min 8 chars)"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
          />
          <div className="flex gap-2">
            <button
              disabled={generating || newPassphrase.length < 8}
              onClick={async () => {
                setGenerating(true);
                await burner.generate(newPassphrase, newLabel);
                setGenerating(false);
                setNewLabel("");
                setNewPassphrase("");
                setShowAddForm(false);
              }}
              className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Generate trading wallet
            </button>
            {!noWallets && (
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewLabel("");
                  setNewPassphrase("");
                }}
                className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {!noWallets && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-3 w-full rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
        >
          + Add another wallet
        </button>
      )}
      {burner.error && <p className="mt-2 text-xs text-rose-400">{burner.error}</p>}
    </div>
  );
}
