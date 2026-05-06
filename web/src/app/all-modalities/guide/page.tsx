import { redirect } from "next/navigation";

export default function GuideLegacyRedirectPage() {
  redirect("/checkin?source=legacy-guide");
}
