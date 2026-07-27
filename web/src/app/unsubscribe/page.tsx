/**
 * B599 · Публичная страница отписки от рекламных сообщений.
 *
 * ПОЧЕМУ ЗДЕСЬ КНОПКА, А НЕ АВТООТПИСКА ПО ССЫЛКЕ. Разрушающее действие на GET
 * — это мина: почтовые клиенты и антивирусные сканеры ходят по ссылкам из писем
 * сами, и «умная» автоотписка отписала бы половину адресатов без единого
 * нажатия. Ровно на этом мы уже обожглись с выходом из аккаунта (INC-070).
 * Поэтому GET показывает страницу, а действие выполняет POST.
 *
 * Страница намеренно не требует входа: человек, отписывающийся из письма, чаще
 * всего не залогинен, а «сначала войдите» — это отказ исполнить отказ.
 */

import type { Metadata } from "next";

import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Отписка от рекламных сообщений — ETerapy",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // Оболочка — та же, что у остальных публичных страниц (`soft-clarity-page
  // soft-public-page` + `soft-shell`). Без неё страница падала на дефолтные
  // токены старой тёмно-фиолетовой темы: снаружи это выглядит как чужой сайт,
  // а приходит человек сюда прямо из нашего письма.
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="unsubscribe-page">
      <article className="soft-shell mx-auto max-w-2xl py-12 md:py-20">
        <p className="soft-eyebrow">рассылка</p>
        <h1 className="soft-display mt-4">Отписка от рекламных сообщений</h1>
        <div className="soft-card mt-8 p-6 md:p-8">
          <UnsubscribeForm token={t ?? null} />
        </div>
      </article>
    </main>
  );
}
