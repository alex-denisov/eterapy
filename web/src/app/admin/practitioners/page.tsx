import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { AdminActions } from "../admin-actions";

export default async function AdminPractitionersPage() {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/");

  const practitioners = await db.practitioner.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  const statusColors: Record<string, string> = {
    ACTIVE:    "bg-green-500/10 text-green-400",
    PENDING:   "bg-yellow-500/10 text-yellow-400",
    SUSPENDED: "bg-destructive/10 text-destructive",
    BLOCKED:   "bg-destructive/20 text-destructive",
  };
  const statusLabels: Record<string, string> = {
    ACTIVE: "Активен", PENDING: "На проверке", SUSPENDED: "Деактивирован", BLOCKED: "Заблокирован",
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Практики</h1>
        <span className="text-sm text-muted-foreground">Всего: {practitioners.length}</span>
      </div>

      <div className="space-y-3">
        {practitioners.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card/20 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{p.user.name}</p>
                <Badge className={statusColors[p.status] ?? ""}>{statusLabels[p.status] ?? p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{p.user.email} · {p.title}</p>
              <p className="text-xs text-muted-foreground">
                {p.pricePerSession.toLocaleString("ru")} ₽/сессия ·{" "}
                {p.reviewCount} отзывов ·{" "}
                {p.sessionCount} сессий
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href={`/practitioners/${p.id}`} target="_blank"
                className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Профиль ↗
              </Link>
              {p.status === "PENDING" && <AdminActions practitionerId={p.id} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
