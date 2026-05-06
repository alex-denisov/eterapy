import { redirect } from "next/navigation";

export default function TarotLegacyRedirectPage() {
  redirect("/all-modalities/checkin?source=legacy-tarot");
}
