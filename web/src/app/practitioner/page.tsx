import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default function LegacyPractitionerPage() {
  permanentRedirect(legacyPublicRedirect("/practitioner") ?? "/practitioners");
}
