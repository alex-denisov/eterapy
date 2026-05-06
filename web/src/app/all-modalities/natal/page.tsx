import { redirect } from "next/navigation";

export default function NatalLegacyRedirectPage() {
  redirect("/all-modalities/checkin?source=legacy-natal");
}
