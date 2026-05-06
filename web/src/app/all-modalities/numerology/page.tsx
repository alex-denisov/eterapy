import { redirect } from "next/navigation";

export default function NumerologyLegacyRedirectPage() {
  redirect("/checkin?source=legacy-numerology");
}
