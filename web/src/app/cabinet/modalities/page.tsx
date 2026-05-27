import { redirect } from "next/navigation";

// B306: /cabinet/modalities is a legacy URL. The product is now called
// "Практика ясности" and lives under /cabinet/practice — see the
// CabinetShell nav and v5Products.directHref for the canonical route.
// We keep this stub to forward any old bookmarks or external links.
export default function LegacyCabinetModalitiesRedirect() {
  redirect("/cabinet/practice");
}
