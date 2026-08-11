import type { Metadata, Viewport } from "next";
import Script from "next/script";
// B667: шрифты лежат в репозитории (`public/fonts` + `fonts.css`), а не
// забираются у Google на каждой сборке. `next/font/google` ходил в сеть при
// каждом `next build`, и когда Google отдавал CSS со ссылками, дающими 404,
// падала вся выкатка. Файлы и таблица @font-face — те же самые, байт в байт;
// обновляются `node scripts/vendor-google-fonts.mjs`.
import fontPreloads from "./font-preloads.json";
import "./fonts.css";
import "./globals.css";
import "./v4-soft.css";
import { Header } from "@/components/header";
import { AppMain } from "@/components/app-main";
import { FooterConditional } from "@/components/footer-conditional";
import { MiniAppProvider } from "@/components/miniapp-provider";
import { Providers } from "@/components/providers";
import { PRE_PAINT_INLINE_SCRIPT } from "@/lib/prepaint-script";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Analytics } from "@/components/analytics";
import { HashScroll } from "@/components/hash-scroll";
import { FingerprintBeacon } from "@/components/fingerprint-beacon";
import { ReferralTracker } from "@/components/referral-tracker";
import { CookieBanner } from "@/components/cookie-banner";
import { seoOrigins } from "@/lib/seo";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

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
  // B548: ownership verification for Яндекс.Вебмастер and Google Search
  // Console (owner accounts, 2026-07-20). Public by design.
  verification: {
    yandex: "2c1d83026c573683",
    google: "zCKEvZUd6Kqbvl2iqyC1Tc_dl52ot9kFbSevY9hYRwU",
    // B632: подтверждение прав на сайт для Дзена (владелец, 2026-07-30).
    // Дзен не даёт подключить RSS, пока сайт не подтверждён, поэтому метатег
    // идёт раньше самой ленты, а не вместе с ней.
    other: { "zen-verification": "QzapAMyUsnQtQhOY4tFAbMugvcP0slYEHwQRai97Q4VjaUMXolzxXbvx1r5tWbBy" },
  },
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
      className="h-full"
      // B381: the pre-paint detect script sets data-miniapp on <html> before
      // hydration; suppress the expected attribute mismatch on this element only.
      suppressHydrationWarning
    >
      <head>
        {/* B667: те же файлы, что предзагружал `next/font` (кириллица и латиница
            обоих семейств) — подмена шрифта не должна ждать разбора CSS. */}
        {fontPreloads.map((file) => (
          <link
            key={file}
            rel="preload"
            as="font"
            type="font/woff2"
            href={`/fonts/${file}`}
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body className="min-h-full flex flex-col">
        {/* B381: set data-miniapp before hydration so the lean mini-app layout
            (CSS hides site header/footer) has no flash-of-chrome. B604 adds
            data-auth-hint from the visible marker cookie so the header does not
            claim «гость», пока не знает. Trusted compile-time constant — no
            user input is interpolated. */}
        <Script id="pre-paint" strategy="beforeInteractive">
          {PRE_PAINT_INLINE_SCRIPT}
        </Script>
        <Providers>
          <MiniAppProvider>
            {/* X2: impersonation banner renders right under the email-verify
                banner (in Providers) and above the header, both static. */}
            <ImpersonationBanner />
            <HashScroll />
            <ReferralTracker />
            <FingerprintBeacon />
            <Header />
            <AppMain>{children}</AppMain>
            <FooterConditional />
            <CookieBanner />
          </MiniAppProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
