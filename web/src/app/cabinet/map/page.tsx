import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";

export default async function MyMapRedirect() {
  const session = await auth();
  guardClientCabinet(session?.user?.role);
  redirect("/cabinet/action-history");
}
