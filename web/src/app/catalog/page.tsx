import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default function LegacyCatalogPage() {
  permanentRedirect(legacyPublicRedirect("/catalog") ?? "/practitioners");
}
