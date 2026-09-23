export function LogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity log</p>
      <div className="h-48 overflow-y-auto font-mono text-xs leading-relaxed text-slate-400">
        {logs.length === 0 && <p className="text-slate-600">Waiting for activity…</p>}
        {logs.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
