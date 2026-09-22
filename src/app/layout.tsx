import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoltSnipe — Real-time Solana pump.fun sniper",
  description:
    "Non-custodial real-time sniping bot for pump.fun on Solana. Connect your wallet, fund a local trading wallet, and let the bot buy and sell live tokens for you.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
