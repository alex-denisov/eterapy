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

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Отписка от рекламных сообщений
      </h1>
      <UnsubscribeForm token={t ?? null} />
    </div>
  );
}
