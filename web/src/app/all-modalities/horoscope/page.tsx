import { redirect } from "next/navigation";

export default function HoroscopeLegacyRedirectPage() {
  redirect("/all-modalities/checkin?source=legacy-horoscope");
}
