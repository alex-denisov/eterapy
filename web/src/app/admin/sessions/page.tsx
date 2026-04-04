import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Page() {
  const session = await auth();
  // @ts-expect-error custom
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");
  return (
    <div className="px-6 py-8">
      <h1 className="font-heading text-2xl font-bold mb-4">Сессии</h1>
      <div className="rounded-xl border border-border/30 bg-card/20 p-6 text-sm text-muted-foreground">
        Раздел в разработке.
      </div>
    </div>
  );
}
