import { redirect } from "next/navigation";

export default function NatalLegacyRedirectPage() {
  redirect("/checkin?source=legacy-natal");
}
