"use client";

// B565: правовые документы в мини-аппе. Текст — тот же самый пакет
// (`lib/legal/pack`), что и на публичных `/legal/*`: расхождение версий между
// поверхностями недопустимо, документ один. Отличается только оболочка.

import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { PageHead } from "@/components/miniapp/subpage-ui";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { miniAppClass, styles } from "@/components/miniapp/styles";

export function LegalScreen({ title, version, publishedAt, markdown, intro }: {
  title: string;
  version: string;
  publishedAt: string;
  markdown: string;
  intro?: { heading: string; points: string[] };
}) {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-legal-screen">
        <PageHead back="/miniapp/profile" eyebrow="правовые документы" title={title} />
        <p className={styles["legal-meta"]}>Версия {version} · действует с {publishedAt}</p>

        {intro ? (
          <section className={styles["legal-intro"]}>
            <strong>{intro.heading}</strong>
            <ul>{intro.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
        ) : null}

        <div className={miniAppClass("product-native-page", "product-action-boundary", "legal-body")}>
          <SoftMarkdown content={markdown} />
        </div>
      </div>
    </MiniAppChrome>
  );
}
