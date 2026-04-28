import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default function LegacySpecialistsPage() {
  permanentRedirect(legacyPublicRedirect("/specialists") ?? "/practitioners");
}
