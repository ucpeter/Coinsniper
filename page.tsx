import Link from "next/link";

const features = [
  {
    title: "Real-time launch detection",
    desc: "Streams pump.fun token creations the instant they land on-chain via PumpPortal's public WebSocket feed — the same data real bots use.",
  },
  {
    title: "Non-custodial by design",
    desc: "Your trading wallet's private key is generated and encrypted in your browser. It is never transmitted to or stored on our servers — only you can sign trades.",
  },
  {
    title: "Real on-chain risk checks",
    desc: "Before every buy: mint & freeze authority checks, deployer holding %, and liquidity floor — computed live from Solana, not a marketing simulation.",
  },
  {
    title: "Take-profit / stop-loss / trailing stop",
    desc: "Fully automated exits with a hold-time timeout, evaluated continuously against live bonding-curve price data.",
  },
  {
    title: "Kill switch",
    desc: "One click stops the bot and liquidates every open position back to SOL immediately.",
  },
  {
    title: "Paper trading mode",
    desc: "Test your filters risk-free with simulated fills before switching to live trading with real funds.",
  },
];

const steps = [
  {
    n: "01",
    title: "Connect your wallet",
    desc: "Phantom or Solflare, used only to fund and withdraw from your trading wallet. Standard non-custodial connection.",
  },
  {
    n: "02",
    title: "Generate a trading wallet",
    desc: "A dedicated burner wallet is created in your browser and encrypted with your passphrase. Fund it with the SOL you're willing to risk.",
  },
  {
    n: "03",
    title: "Configure & go live",
    desc: "Set take-profit, stop-loss, dev-hold and liquidity filters, then start the bot. It buys and sells for you in real time.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-lg font-bold tracking-tight">
            ⚡ Volt<span className="text-violet-400">Snipe</span>
          </span>
          <Link
            href="/terminal"
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Launch terminal
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="inline-block rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 ring-1 ring-violet-500/30">
          Live on Solana mainnet · non-custodial
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          A real, live sniping bot for pump.fun — <span className="text-violet-400">your keys never leave your browser.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-slate-400">
          VoltSnipe watches every new pump.fun token launch in real time and automatically buys and sells based on
          your rules. Trades are signed locally by a wallet only you control — we never take custody of your funds.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/terminal"
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Launch terminal →
          </Link>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-xs text-slate-600">
          Memecoin sniping is extremely high risk. The overwhelming majority of pump.fun tokens lose most or all of
          their value within minutes. Only ever risk funds you can afford to lose completely.
        </p>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold">From zero to live sniping in three steps</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-xl border border-slate-800 bg-slate-950/60 p-6">
                <span className="text-3xl font-bold text-violet-500/40">{s.n}</span>
                <h3 className="mt-2 font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold">Built on real infrastructure, not marketing claims</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30 py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-2xl font-bold">Full disclosure</h2>
          <div className="mt-8 space-y-4 text-sm text-slate-400">
            <p>
              <strong className="text-white">No audits, no guarantees.</strong> Unlike sites that advertise
              &quot;CertiK 96/100&quot; or &quot;$100K bug bounty&quot; badges, we make no such claims here. This is
              a real trading tool that talks directly to the Solana blockchain and a third-party API
              (PumpPortal) — review the code, start with a tiny amount, and use paper-trading mode first.
            </p>
            <p>
              <strong className="text-white">Non-custodial architecture.</strong> Your trading wallet keypair is
              generated client-side and encrypted with your passphrase using AES-GCM before being stored in your
              browser&apos;s local storage. It is never sent to our servers in any form.
            </p>
            <p>
              <strong className="text-white">Real execution, real fees.</strong> Every buy/sell is a genuine Solana
              transaction against the pump.fun bonding curve (or Raydium post-migration), subject to network fees,
              slippage, and a small fee taken by the PumpPortal transaction-building service.
            </p>
            <p>
              <strong className="text-white">You are responsible for your funds.</strong> Automated sniping of
              brand-new memecoins is one of the highest-risk activities in crypto. Rug pulls, honeypots, and total
              loss are common even with safety filters enabled.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-600">
        VoltSnipe is an independent tool and is not affiliated with pump.fun, PumpPortal, Phantom, or Solflare.
      </footer>
    </main>
  );
}
