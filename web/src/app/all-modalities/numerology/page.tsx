import { redirect } from "next/navigation";

export default function NumerologyLegacyRedirectPage() {
  redirect("/all-modalities/checkin?source=legacy-numerology");
}
