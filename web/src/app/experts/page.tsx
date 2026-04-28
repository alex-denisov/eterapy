import { permanentRedirect } from "next/navigation";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

export default function LegacyExpertsPage() {
  permanentRedirect(legacyPublicRedirect("/experts") ?? "/practitioners");
}
