import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ETerapy — этичная эзотерическая платформа",
  description:
    "Найди проверенного тарологa, астрологa или нумерологa. Фиксированная цена, AI-инструменты, международные платежи. Безопасно. Прозрачно. Онлайн.",
  keywords: [
    "таролог онлайн",
    "астролог онлайн",
    "нумеролог онлайн",
    "таро расклад",
    "натальная карта",
    "этичная эзотерика",
  ],
  openGraph: {
    title: "ETerapy — этичная эзотерическая платформа",
    description:
      "Найди проверенного практика. Фиксированная цена. AI-инструменты. Безопасно.",
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
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
