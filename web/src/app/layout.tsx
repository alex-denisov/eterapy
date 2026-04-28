import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { FooterConditional } from "@/components/footer-conditional";
import { Providers } from "@/components/providers";
import { Analytics } from "@/components/analytics";
import { HashScroll } from "@/components/hash-scroll";
import { brandAssets } from "@/lib/brand-assets";
import { seoOrigins } from "@/lib/seo";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: false,
});

const homeMetadata = createPublicPageMetadata("/");

export const metadata: Metadata = {
  ...homeMetadata,
  metadataBase: new URL(seoOrigins.main),
  keywords: [
    "задать вопрос онлайн",
    "самопознание онлайн",
    "таро онлайн",
    "натальная карта онлайн",
    "нумерология онлайн",
    "этичная эзотерика",
  ],
  icons: {
    icon: [
      { url: brandAssets.favicon.ico, sizes: "any" },
      { url: brandAssets.favicon.png16, type: "image/png", sizes: "16x16" },
      { url: brandAssets.favicon.png32, type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: brandAssets.favicon.apple180, sizes: "180x180" }],
  },
  manifest: brandAssets.favicon.manifest,
  openGraph: {
    ...homeMetadata.openGraph,
    type: "website",
    locale: "ru_RU",
  },
};

export const viewport: Viewport = {
  themeColor: "#081223",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${inter.variable} ${playfair.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          <HashScroll />
          <Header />
          <main className="flex-1">{children}</main>
          <FooterConditional />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
