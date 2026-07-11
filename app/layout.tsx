import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oneal Wealth Dashboard",
  description: "A read-only personal wealth dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
