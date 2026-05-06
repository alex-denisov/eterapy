import { notFound, redirect } from "next/navigation";

import CheckinPage from "@/app/checkin/page";

const LEGACY_SLUGS = ["tarot", "horoscope", "numerology", "natal", "guide"] as const;
const ALL_SLUGS = ["checkin", ...LEGACY_SLUGS] as const;

export default async function CabinetModalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "checkin") return <CheckinPage />;
  if ((LEGACY_SLUGS as readonly string[]).includes(slug)) {
    redirect(`/cabinet/modalities/checkin?source=legacy-${slug}-cabinet`);
  }
  notFound();
}

export function generateStaticParams() {
  return ALL_SLUGS.map((slug) => ({ slug }));
}
