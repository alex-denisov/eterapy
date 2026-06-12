import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import "./v4-soft.css";
import { Header } from "@/components/header";
import { FooterConditional } from "@/components/footer-conditional";
import { MiniAppProvider } from "@/components/miniapp-provider";
import { Providers } from "@/components/providers";
import { MINIAPP_INLINE_SCRIPT } from "@/lib/miniapp";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Analytics } from "@/components/analytics";
import { HashScroll } from "@/components/hash-scroll";
import { FingerprintBeacon } from "@/components/fingerprint-beacon";
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
    <html
      lang="ru"
      className={`${bodyFont.variable} ${headingFont.variable} h-full`}
      // B381: the pre-paint detect script sets data-miniapp on <html> before
      // hydration; suppress the expected attribute mismatch on this element only.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* B381: set data-miniapp before hydration so the lean mini-app layout
            (CSS hides site header/footer) has no flash-of-chrome. Trusted
            compile-time constant — no user input is interpolated. */}
        <Script id="miniapp-detect" strategy="beforeInteractive">
          {MINIAPP_INLINE_SCRIPT}
        </Script>
        <Providers>
          <MiniAppProvider>
            {/* X2: impersonation banner renders right under the email-verify
                banner (in Providers) and above the header, both static. */}
            <ImpersonationBanner />
            <HashScroll />
            <FingerprintBeacon />
            <Header />
            <main className="flex-1">{children}</main>
            <FooterConditional />
            <CookieBanner />
          </MiniAppProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
