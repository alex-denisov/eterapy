import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

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

export const metadata: Metadata = {
  title: "ETerapy — этичная эзотерическая платформа",
  description:
    "Найди проверенного таролога, астролога или нумеролога. Фиксированная цена за сессию. Бесплатные инструменты самопознания. Безопасно. Прозрачно. Онлайн.",
  keywords: [
    "таролог онлайн",
    "астролог онлайн",
    "нумеролог онлайн",
    "таро расклад",
    "натальная карта",
    "этичная эзотерика",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "ETerapy — этичная эзотерическая платформа",
    description:
      "Найди проверенного практика. Фиксированная цена. Инструменты самопознания. Безопасно.",
    type: "website",
    locale: "ru_RU",
  },
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
          <Header />
          <EmailVerificationBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
