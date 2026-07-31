import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Theme } from "@radix-ui/themes";
import { ThemeProvider } from "next-themes";
import "@radix-ui/themes/styles.css";

import { ColorThemeProvider } from "@/components/color-theme-provider";
import {
  colorThemes,
  colorThemeStorageKey,
  defaultColorTheme,
} from "@/lib/color-theme";

import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Pat",
  description: "Patent translation request workspace for requesters and PM teams.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const colorThemeScript = `
  (() => {
    const fallback = "${defaultColorTheme}";
    try {
      const stored = window.localStorage.getItem("${colorThemeStorageKey}");
      const allowed = ${JSON.stringify(colorThemes.map((theme) => theme.value))};
      document.documentElement.dataset.colorTheme =
        allowed.includes(stored) ? stored : fallback;
    } catch {
      document.documentElement.dataset.colorTheme = fallback;
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-color-theme={defaultColorTheme}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
      </head>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ColorThemeProvider>
            <Theme
              appearance="inherit"
              accentColor="gray"
              grayColor="sand"
              radius="medium"
              hasBackground={false}
            >
              {children}
            </Theme>
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
