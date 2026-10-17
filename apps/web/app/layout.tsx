import type { Metadata } from "next";
import { B612, B612_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { TipLayer } from "../components/Tip";
// B612 was designed for Airbus cockpit displays: the UI and data face. Source Serif 4
// sets narration and quoted maintenance records. B612 Mono is only for Cypher.
const ui = B612({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-b612" });
const code = B612_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-b612-mono" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = { title: "Black Box", description: "Warning signs in maintenance records, before the accident" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${code.variable} ${serif.variable}`}>
      {/* Keeps Dark Reader off: its edits break hydration, and recolouring the heat map changes what it says. */}
      <head><meta name="darkreader-lock" /></head>
      <body>{children}<TipLayer /></body>
    </html>
  );
}
