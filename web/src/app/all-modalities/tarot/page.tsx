import { redirect } from "next/navigation";

export default function TarotLegacyRedirectPage() {
  redirect("/checkin?source=legacy-tarot");
}
