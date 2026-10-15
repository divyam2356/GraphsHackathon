import type { Metadata } from "next";
export const metadata: Metadata = { title: "Black Box — warning signs before plane accidents" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: "system-ui", margin: 0 }}>{children}</body></html>);
}
