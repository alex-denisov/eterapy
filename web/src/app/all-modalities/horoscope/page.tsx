import { redirect } from "next/navigation";

export default function HoroscopeLegacyRedirectPage() {
  redirect("/checkin?source=legacy-horoscope");
}
