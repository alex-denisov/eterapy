import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default function LegacyPractitionersCatalogPage() {
  permanentRedirect(legacyPublicRedirect("/practitioners/catalog") ?? "/practitioners");
}
