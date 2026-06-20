import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allLegalDocSlugs, getLegalDoc, LEGAL_DOC_INTROS } from "@/lib/legal/registry";
import { legalDocMarkdown } from "@/lib/legal/pack";
import { LegalMarkdown } from "@/components/legal/legal-markdown";
import { canonicalUrl } from "@/lib/seo";

// Only the 14 public documents are routable; unknown slugs (incl. internal
// documents 15-17/19) fall through to notFound().
export const dynamicParams = false;

export function generateStaticParams() {
  return allLegalDocSlugs().map((doc) => ({ doc }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ doc: string }> },
): Promise<Metadata> {
  const { doc } = await params;
  const meta = getLegalDoc(doc);
  if (!meta) return {};
  const url = canonicalUrl(`/legal/${meta.slug}`);
  const title = `${meta.title} — ETerapy`;
  return {
    title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: meta.description,
      url,
      siteName: "ETerapy",
      locale: "ru_RU",
      type: "article",
    },
  };
}

function formatPublished(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function LegalDocPage(
  { params }: { params: Promise<{ doc: string }> },
) {
  const { doc } = await params;
  const meta = getLegalDoc(doc);
  if (!meta) notFound();

  const markdown = legalDocMarkdown(meta.slug);
  const intro = LEGAL_DOC_INTROS[meta.slug];

  return (
    <article className="legal-prose">
      <h1 className="font-heading text-2xl font-bold">{meta.title}</h1>
      <p className="legal-meta">
        Редакция {meta.version} · {formatPublished(meta.publishedAt)}
      </p>
      {intro && (
        <aside data-testid={`${meta.slug}-summary`} className="legal-summary">
          <p className="legal-summary-title">{intro.heading}</p>
          <ul>
            {intro.points.map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
          </ul>
        </aside>
      )}
      <LegalMarkdown markdown={markdown} />
    </article>
  );
}
