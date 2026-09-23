import { RiskBadge } from "./RiskBadge";
import { fmtPct, fmtUsd, shortAddr } from "@/lib/format";
import type { ScannedToken } from "@/lib/types";

const decisionStyles: Record<ScannedToken["decision"], string> = {
  pending: "text-slate-500",
  checking: "text-amber-400",
  passed: "text-sky-400",
  skipped: "text-slate-500",
  bought: "text-emerald-400",
  error: "text-rose-400",
};

export function LiveFeedTable({ tokens, feedStatus }: { tokens: ScannedToken[]; feedStatus: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">Live pump.fun launch scanner</p>
        <span className={`flex items-center gap-1.5 text-[11px] ${feedStatus === "open" ? "text-emerald-400" : "text-slate-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${feedStatus === "open" ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
          {feedStatus === "open" ? "live" : feedStatus}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-500">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Token</th>
              <th className="py-1.5 pr-2 font-medium">Dev</th>
              <th className="py-1.5 pr-2 font-medium">Dev hold</th>
              <th className="py-1.5 pr-2 font-medium">Liquidity</th>
              <th className="py-1.5 pr-2 font-medium">Risk</th>
              <th className="py-1.5 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-600">
                  No tokens scanned yet — start the bot to begin monitoring pump.fun in real time.
                </td>
              </tr>
            )}
            {tokens.map((t) => (
              <tr key={t.mint + t.createdAt} className="border-t border-slate-800/60">
                <td className="py-1.5 pr-2">
                  <p className="font-medium text-white">{t.symbol || "?"}</p>
                  <p className="font-mono text-[10px] text-slate-600">{shortAddr(t.mint)}</p>
                </td>
                <td className="py-1.5 pr-2 font-mono text-slate-500">{shortAddr(t.devWallet)}</td>
                <td className="py-1.5 pr-2 text-slate-300">{fmtPct(t.devHoldPct, 1).replace("+", "")}</td>
                <td className="py-1.5 pr-2 text-slate-300">{fmtUsd(t.liquidityUsd)}</td>
                <td className="py-1.5 pr-2">
                  <RiskBadge risk={t.risk} />
                </td>
                <td className={`py-1.5 font-medium ${decisionStyles[t.decision]}`} title={t.skipReason}>
                  {t.decision}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
