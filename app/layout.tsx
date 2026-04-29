import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/app/components/AppNav";

export const metadata: Metadata = {
  title: "Schwab Lens",
  description: "Local-first read-only Schwab brokerage dashboards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
