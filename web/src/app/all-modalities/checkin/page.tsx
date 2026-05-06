import { redirect } from "next/navigation";

// Canonical URL moved to /checkin
export default function CheckinDeprecatedPage() {
  redirect("/checkin");
}
