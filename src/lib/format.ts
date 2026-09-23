export function fmtSol(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} SOL`;
}

export function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function shortAddr(addr: string | null | undefined, size = 4): string {
  if (!addr) return "—";
  if (addr.length <= size * 2 + 3) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
