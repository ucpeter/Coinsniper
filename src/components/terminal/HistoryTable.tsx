import { fmtSol, shortAddr, timeAgo } from "@/lib/format";
import type { TradeRecord } from "@/lib/types";

export function HistoryTable({ history }: { history: TradeRecord[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Trade history</p>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-500">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Token</th>
              <th className="py-1.5 pr-2 font-medium">Side</th>
              <th className="py-1.5 pr-2 font-medium">Amount</th>
              <th className="py-1.5 pr-2 font-medium">Status</th>
              <th className="py-1.5 pr-2 font-medium">Tx</th>
              <th className="py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-600">
                  No trades yet.
                </td>
              </tr>
            )}
            {history.map((t) => (
              <tr key={t.id} className="border-t border-slate-800/60">
                <td className="py-1.5 pr-2">
                  <p className="font-medium text-white">
                    {t.symbol || "?"} {t.paperTrading && <span className="text-amber-400">(paper)</span>}
                  </p>
                  <p className="font-mono text-[10px] text-slate-600">{shortAddr(t.mint)}</p>
                </td>
                <td className={`py-1.5 pr-2 font-semibold ${t.side === "buy" ? "text-sky-400" : "text-fuchsia-400"}`}>
                  {t.side}
                </td>
                <td className="py-1.5 pr-2 text-slate-300">{fmtSol(t.amountSol, 3)}</td>
                <td
                  className={`py-1.5 pr-2 ${
                    t.status === "confirmed" ? "text-emerald-400" : t.status === "failed" ? "text-rose-400" : "text-amber-400"
                  }`}
                >
                  {t.status}
                </td>
                <td className="py-1.5 pr-2">
                  {t.txSignature && !t.paperTrading ? (
                    <a
                      href={`https://solscan.io/tx/${t.txSignature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-400 hover:underline"
                    >
                      view
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 text-slate-500">{timeAgo(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
