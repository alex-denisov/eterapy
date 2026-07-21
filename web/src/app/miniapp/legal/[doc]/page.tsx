import { notFound } from "next/navigation";
import { allLegalDocSlugs, getLegalDoc, LEGAL_DOC_INTROS } from "@/lib/legal/registry";
import { legalDocMarkdown } from "@/lib/legal/pack";
import { LegalScreen } from "@/components/miniapp/screens/legal-screen";

// Те же 14 публичных документов, что и на `/legal/*` — реестр один.
export const dynamicParams = false;

export function generateStaticParams() {
  return allLegalDocSlugs().map((doc) => ({ doc }));
}

function formatPublished(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export default async function MiniAppLegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const meta = getLegalDoc(doc);
  if (!meta) notFound();

  return (
    <LegalScreen
      title={meta.title}
      version={meta.version}
      publishedAt={formatPublished(meta.publishedAt)}
      markdown={legalDocMarkdown(meta.slug)}
      intro={LEGAL_DOC_INTROS[meta.slug]}
    />
  );
}
