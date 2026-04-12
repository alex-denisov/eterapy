import { notFound } from "next/navigation";

// Tool pages rendered within the cabinet layout so the sidebar stays intact.
// These are client components — importing them here is valid in Next.js App Router.
import TarotPage from "@/app/all-modalities/tarot/page";
import CheckinPage from "@/app/all-modalities/checkin/page";
import HoroscopePage from "@/app/all-modalities/horoscope/page";
import NumerologyPage from "@/app/all-modalities/numerology/page";
import NatalPage from "@/app/all-modalities/natal/page";
import GuidePage from "@/app/all-modalities/guide/page";

const SLUG_MAP: Record<string, React.ComponentType> = {
  tarot: TarotPage,
  checkin: CheckinPage,
  horoscope: HoroscopePage,
  numerology: NumerologyPage,
  natal: NatalPage,
  guide: GuidePage,
};

export default async function CabinetModalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const Page = SLUG_MAP[slug];
  if (!Page) notFound();
  return <Page />;
}

export function generateStaticParams() {
  return Object.keys(SLUG_MAP).map((slug) => ({ slug }));
}
