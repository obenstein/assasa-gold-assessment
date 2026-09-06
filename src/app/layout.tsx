import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assasa Gold — Buy & Sell Gold Instantly",
  description:
    "Transparent gold trading platform. Get live prices, lock a quote, and trade 24K gold in seconds. PKR-denominated, mobile-first.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
