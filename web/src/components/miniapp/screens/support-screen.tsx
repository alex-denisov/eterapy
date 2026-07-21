"use client";

// B565 (owner 2026-07-21): «Страница "Поддержки" не работает вообще, там только
// кнопки-заглушки». Механики поддержки уже существуют и обкатаны в вебе
// (B464 IB6): поиск по базе знаний → категории → вопросы категории → эскалация
// (почта · форма · чат для финансовых и срочных тем). Владелец просил оставить
// «только блок умной поддержки» и «существующие механики … как в вебе» —
// поэтому берём ровно тот компонент, а не переписываем его заново: копия
// разошлась бы с оригиналом на первой же правке базы знаний.
//
// Тёмную палитру мини-аппа даёт пара классов-адаптеров: `product-native-page`
// переопределяет токены `--soft-*`, `product-action-boundary` — сами
// компоненты (карточки, поля, кнопки, аккордеон).

import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { PageHead } from "@/components/miniapp/subpage-ui";
import { SupportHelpCenter } from "@/components/support/support-help-center";
import { miniAppClass, styles } from "@/components/miniapp/styles";

export function SupportScreen() {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-support-screen">
        <PageHead
          back="/miniapp/profile"
          eyebrow="поддержка eterapy"
          title="Центр поддержки"
          description="Опишите вопрос своими словами — покажем ответ из базы знаний."
        />
        <div className={miniAppClass("product-native-page", "product-action-boundary")}>
          {/* Чат поддержки требует аккаунта — гостю честнее показать почту и
              форму, чем кнопку, которая упрётся в 401. */}
          <SupportHelpCenter showChat={data.viewer.authenticated} showHeading={false} />
        </div>
      </div>
    </MiniAppChrome>
  );
}
