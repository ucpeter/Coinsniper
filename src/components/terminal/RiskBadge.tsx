import type { RiskAssessment } from "@/lib/types";

export function RiskBadge({ risk }: { risk?: RiskAssessment | null }) {
  if (!risk) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-medium text-slate-300">
        unchecked
      </span>
    );
  }
  const styles =
    risk.verdict === "safe"
      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
      : risk.verdict === "caution"
        ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
        : "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`} title={risk.reasons.join(" · ")}>
      {risk.score}/100
    </span>
  );
}
