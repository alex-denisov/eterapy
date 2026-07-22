"use client";

// B573 (owner 2026-07-22): «"Решить вопрос в чате" должен быть 1-в-1 как
// "Первичный разбор"». Экран чата собирался product-фреймом услуги, а разбор —
// `DialogueShell` с оболочкой `dialogue-surface`. Весь чат-контракт мини-аппа
// (аватары, пузыри, прижатый композер, круглая кнопка отправки, поведение при
// клавиатуре) живёт в CSS под `.dialogue-surface` — на чат он просто не
// распространялся. Поэтому экран собран той же парой, что и `checkin-screen`:
// расходиться им теперь нечем.

import { CompanionChatPanel } from "@/components/companion/companion-chat-panel";
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function MiniAppChatScreen({ dialogueId, analysisId, autoStart, loginNext }: {
  dialogueId: string | null;
  analysisId: string | null;
  autoStart: boolean;
  loginNext: string;
}) {
  const { data, viewerName } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <DialogueShell
        title="Решить вопрос в чате"
        kicker="чат"
        surface="miniapp"
        className={`${styles["dialogue-surface"]} soft-dialogue-page`}
        phase="chat"
      >
        <CompanionChatPanel
          dialogueId={dialogueId}
          analysisId={analysisId}
          autoStart={autoStart}
          loginNext={loginNext}
          userName={viewerName}
        />
      </DialogueShell>
    </MiniAppChrome>
  );
}
