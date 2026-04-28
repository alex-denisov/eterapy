import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default async function LegacyModalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(legacyPublicRedirect(`/modalities/${slug}`) ?? "/all-modalities");
}
