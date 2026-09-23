"use client";

import type { BotConfig } from "@/lib/types";

interface Props {
  config: BotConfig;
  onChange: (patch: Partial<BotConfig>) => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-slate-600">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500";

export function ConfigPanel({ config, onChange, onSave, saving, disabled }: Props) {
  const num = (v: string) => (v === "" ? 0 : Number(v));
  // A numeric field whose value is 0 shows as an empty box instead of a
  // literal "0" — so typing a number means just typing, not deleting a
  // zero first. Clearing the box all the way back out still saves as 0,
  // same as before; this only changes what's displayed while at rest.
  const displayVal = (v: number) => (v === 0 ? "" : v);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">Strategy configuration</p>
        <label className="flex items-center gap-2 text-xs text-amber-400">
          <input
            type="checkbox"
            checked={config.paperTrading}
            onChange={(e) => onChange({ paperTrading: e.target.checked })}
            disabled={disabled}
          />
          Paper trading (no real funds)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Min buy (SOL)">
          <input
            className={inputClass}
            type="number"
            step="0.001"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.minAmountSol)}
            onChange={(e) => onChange({ minAmountSol: num(e.target.value) })}
          />
        </Field>
        <Field label="Max buy (SOL)">
          <input
            className={inputClass}
            type="number"
            step="0.001"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.maxAmountSol)}
            onChange={(e) => onChange({ maxAmountSol: num(e.target.value) })}
          />
        </Field>
        <Field label="Slippage (%)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.slippagePct)}
            onChange={(e) => onChange({ slippagePct: num(e.target.value) })}
          />
        </Field>
        <Field label="Priority fee (SOL)">
          <input
            className={inputClass}
            type="number"
            step="0.0001"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.priorityFeeSol)}
            onChange={(e) => onChange({ priorityFeeSol: num(e.target.value) })}
          />
        </Field>
        <Field label="Take profit (%)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.takeProfitPct)}
            onChange={(e) => onChange({ takeProfitPct: num(e.target.value) })}
          />
        </Field>
        <Field label="Stop loss (%)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.stopLossPct)}
            onChange={(e) => onChange({ stopLossPct: num(e.target.value) })}
          />
        </Field>
        <Field label="Trailing stop (%)" hint="0 = disabled">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.trailingStopPct)}
            onChange={(e) => onChange({ trailingStopPct: num(e.target.value) })}
          />
        </Field>
        <Field label="Max hold time (sec)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.maxHoldTimeSec)}
            onChange={(e) => onChange({ maxHoldTimeSec: num(e.target.value) })}
          />
        </Field>
        <Field label="Max dev hold (%)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.maxDevHoldPct)}
            onChange={(e) => onChange({ maxDevHoldPct: num(e.target.value) })}
          />
        </Field>
        <Field label="Min liquidity (USD)">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.minLiquidityUsd)}
            onChange={(e) => onChange({ minLiquidityUsd: num(e.target.value) })}
          />
        </Field>
        <Field label="Max liquidity (USD)" hint="0 = no ceiling">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.maxLiquidityUsd)}
            onChange={(e) => onChange({ maxLiquidityUsd: num(e.target.value) })}
          />
        </Field>
        <Field label="Max concurrent positions">
          <input
            className={inputClass}
            type="number"
            placeholder="0"
            disabled={disabled}
            value={displayVal(config.maxPositions)}
            onChange={(e) => onChange({ maxPositions: num(e.target.value) })}
          />
        </Field>
        <Field label="Position size mode">
          <select
            className={inputClass}
            disabled={disabled}
            value={config.positionSizeMode}
            onChange={(e) => onChange({ positionSizeMode: e.target.value as BotConfig["positionSizeMode"] })}
          >
            <option value="fixed">Fixed (min)</option>
            <option value="random">Random (min–max)</option>
            <option value="risk_scaled">Risk-scaled</option>
          </select>
        </Field>
        <Field label="Risk tolerance">
          <select
            className={inputClass}
            disabled={disabled}
            value={config.riskTolerance}
            onChange={(e) => onChange({ riskTolerance: e.target.value as BotConfig["riskTolerance"] })}
          >
            <option value="low">Low (score ≥ 70)</option>
            <option value="medium">Medium (score ≥ 50)</option>
            <option value="high">High (score ≥ 30)</option>
          </select>
        </Field>
        <Field label="Pool">
          <select
            className={inputClass}
            disabled={disabled}
            value={config.pool}
            onChange={(e) => onChange({ pool: e.target.value as BotConfig["pool"] })}
          >
            <option value="pump">Pump.fun bonding curve</option>
            <option value="raydium">Raydium (post-migration)</option>
            <option value="auto">Auto-detect</option>
          </select>
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { key: "useBlacklist", label: "Use wallet blacklist" },
          { key: "honeypotDetection", label: "Honeypot detection" },
          { key: "rugProtection", label: "Rug-pull protection" },
          { key: "autoCompound", label: "Auto-compound" },
        ].map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(config[t.key as keyof BotConfig])}
              onChange={(e) => onChange({ [t.key]: e.target.checked } as Partial<BotConfig>)}
            />
            {t.label}
          </label>
        ))}
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save configuration"}
      </button>
    </div>
  );
}
