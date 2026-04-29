import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/app/components/AppNav";
import { loadAccounts } from "@/lib/server/home";

export const metadata: Metadata = {
  title: "Schwab Lens",
  description: "Local-first read-only Schwab brokerage dashboards",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const accounts = await loadAccounts();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppNav accounts={accounts} />
        {children}
      </body>
    </html>
  );
}
