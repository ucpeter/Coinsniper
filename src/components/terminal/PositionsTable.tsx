import { fmtPct, fmtSol, shortAddr, timeAgo } from "@/lib/format";
import type { Position } from "@/lib/types";

export function PositionsTable({ positions, onSell }: { positions: Position[]; onSell: (id: number) => void }) {
  const open = positions.filter((p) => p.status === "open");
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Open positions ({open.length})</p>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-500">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Token</th>
              <th className="py-1.5 pr-2 font-medium">Entry</th>
              <th className="py-1.5 pr-2 font-medium">PnL</th>
              <th className="py-1.5 pr-2 font-medium">Age</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-600">
                  No open positions.
                </td>
              </tr>
            )}
            {open.map((p) => {
              const pnlPct = p.currentPriceSol
                ? ((p.currentPriceSol - p.entryPriceSol) / p.entryPriceSol) * 100
                : 0;
              return (
                <tr key={p.id} className="border-t border-slate-800/60">
                  <td className="py-1.5 pr-2">
                    <p className="font-medium text-white">
                      {p.symbol || "?"} {p.paperTrading && <span className="text-amber-400">(paper)</span>}
                    </p>
                    <p className="font-mono text-[10px] text-slate-600">{shortAddr(p.mint)}</p>
                  </td>
                  <td className="py-1.5 pr-2 text-slate-300">{fmtSol(p.entryAmountSol, 3)}</td>
                  <td className={`py-1.5 pr-2 font-semibold ${pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmtPct(pnlPct)}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-500">{timeAgo(p.openedAt)}</td>
                  <td className="py-1.5">
                    <button
                      onClick={() => onSell(p.id)}
                      className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                    >
                      Sell now
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
