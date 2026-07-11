import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Oneal Wealth",
    default: "Oneal Wealth · 個人財務儀表板",
  },
  description: "Oneal 的個人財務儀表板 — 淨資產、投資組合與財務健康總覽。",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100",
  ),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        {/* Google Fonts: IBM Plex Sans, IBM Plex Mono, Noto Sans TC */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* Prevent theme flash: set data-theme early */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('oneal-wealth-theme');
                  if (t === 'dark' || t === 'light') {
                    document.documentElement.setAttribute('data-theme', t);
                  } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
