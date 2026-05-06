import { redirect } from "next/navigation";

export default function GuideLegacyRedirectPage() {
  redirect("/all-modalities/checkin?source=legacy-guide");
}
