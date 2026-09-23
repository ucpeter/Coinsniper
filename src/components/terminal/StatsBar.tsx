import { fmtPct, fmtSol } from "@/lib/format";
import type { TradeRecord } from "@/lib/types";

export function StatsBar({ history, openCount, solPriceUsd }: { history: TradeRecord[]; openCount: number; solPriceUsd: number }) {
  const sells = history.filter((t) => t.side === "sell" && t.status === "confirmed");
  const totalTrades = sells.length;
  const wins = sells.filter((t) => {
    const buy = history.find((b) => b.positionId === t.positionId && b.side === "buy");
    return buy ? t.priceSol > buy.priceSol : false;
  }).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const realizedSol = sells.reduce((sum, sell) => {
    const buy = history.find((b) => b.positionId === sell.positionId && b.side === "buy");
    if (!buy) return sum;
    return sum + (sell.amountSol - buy.amountSol);
  }, 0);

  const items = [
    { label: "Open positions", value: String(openCount) },
    { label: "Closed trades", value: String(totalTrades) },
    { label: "Win rate", value: totalTrades > 0 ? `${winRate.toFixed(0)}%` : "—" },
    { label: "Realized PnL", value: fmtSol(realizedSol), sub: `≈ ${fmtPct((realizedSol * solPriceUsd) / 1)}`, positive: realizedSol >= 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              "positive" in item ? (item.positive ? "text-emerald-400" : "text-rose-400") : "text-white"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
