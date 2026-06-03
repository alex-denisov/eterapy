import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import "./v4-soft.css";
import { Header } from "@/components/header";
import { FooterConditional } from "@/components/footer-conditional";
import { Providers } from "@/components/providers";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Analytics } from "@/components/analytics";
import { HashScroll } from "@/components/hash-scroll";
import { CookieBanner } from "@/components/cookie-banner";
import { seoOrigins } from "@/lib/seo";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

const homeMetadata = createPublicPageMetadata("/");

const headingFont = Cormorant_Garamond({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading-v4",
  display: "swap",
});

const bodyFont = Manrope({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body-v4",
  display: "swap",
});

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
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    ...homeMetadata.openGraph,
    type: "website",
    locale: "ru_RU",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF6EE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${bodyFont.variable} ${headingFont.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* X2: impersonation banner renders right under the email-verify
              banner (in Providers) and above the header, both static. */}
          <ImpersonationBanner />
          <HashScroll />
          <Header />
          <main className="flex-1">{children}</main>
          <FooterConditional />
          <CookieBanner />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
