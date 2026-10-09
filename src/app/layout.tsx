import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "Tempo Payment Finance",
  description:
    "Working capital for the hours between payout and settlement. A Tempo testnet demonstration.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="font-sans">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
