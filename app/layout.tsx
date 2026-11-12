import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tripwire — AI fraud review for PayPal orders",
  description: "The AI spots the risk, you make the call, and fraud is stopped before the money moves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
