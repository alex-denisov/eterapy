import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { ShareAttribution } from "@/app/share/share-attribution";

export const metadata = {
  title: "ETerapy — мягкое приглашение разобраться",
  description: "Обезличенная страница-приглашение после инсайта ETerapy: задайте свой вопрос и получите бережный первичный разбор.",
  robots: { index: true, follow: true },
};

export default async function ShareLandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = firstParam(params?.token);
  const source = firstParam(params?.from) ?? "share";
  const topic = firstParam(params?.topic);
  const checkinUrl = mainUrl(`/checkin?source=share${token ? `&ref=${encodeURIComponent(token)}` : ""}`);

  return (
    <main className="soft-clarity-page min-h-screen bg-[var(--soft-paper)]">
      <ShareAttribution token={token} source={source} topic={topic} />
      <section className="soft-section px-4 py-16 sm:px-6 lg:py-24" data-testid="public-share-landing">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <Link href={mainUrl("/")} aria-label="ETerapy">
              <BrandLogo theme="light" />
            </Link>
            <p className="premium-eyebrow mt-12">приглашение разобраться</p>
            <h1 className="soft-heading mt-4 max-w-3xl text-5xl md:text-7xl">
              Иногда одного вопроса достаточно, чтобы стало чуть тише внутри.
            </h1>
            <p className="soft-lede mt-6 max-w-2xl">
              Вам прислали обезличенный инсайт ETerapy. Здесь нет чужих имен, приватных вопросов или ссылок на профиль.
              Можно задать свой вопрос и получить бережный первичный разбор.
            </p>
            {topic && (
              <p className="mt-5 inline-flex rounded-full border border-[var(--soft-paper-edge)] bg-white/55 px-4 py-2 text-sm text-[var(--soft-ink-soft)]">
                Тема приглашения: {topic}
              </p>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={checkinUrl} className="soft-button soft-button-primary" data-analytics-event="share_dialogue_cta_clicked" data-analytics-surface="public_share" data-analytics-target={source}>
                Задать свой вопрос
              </Link>
              <Link href={mainUrl("/how-it-works")} className="soft-button soft-button-ghost">
                Как это работает
              </Link>
            </div>
          </div>

          <div className="soft-card soft-form-panel">
            <p className="premium-eyebrow">безопасный обмен</p>
            <div className="mt-6 rounded-[28px] bg-[linear-gradient(160deg,#F4D9C1_0%,#E8C4B8_54%,#DBD3EA_100%)] p-8 text-[var(--soft-bordeaux)] shadow-[0_22px_70px_rgba(92,42,44,0.18)]">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-current" />
                <span className="font-heading text-lg font-semibold">ETerapy</span>
              </div>
              <p className="mt-12 font-heading text-3xl italic leading-snug">
                Я могу услышать себя без спешки и выбрать один следующий шаг.
              </p>
              <p className="mt-10 text-sm opacity-70">eterapy.com/share</p>
            </div>
            <div className="mt-6 space-y-3 text-sm text-[var(--soft-ink-faint)]">
              <p>Карточки ETerapy по умолчанию обезличены.</p>
              <p>В кризисных и опасных темах платные CTA не показываются, а пользователь видит “Экстренную поддержку”.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
