import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export default async function AdminSessionsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const videoSessions = await db.videoSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      booking: {
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const STATUS_COLORS: Record<string, string> = {
    WAITING:   "bg-yellow-500/10 text-yellow-400",
    ACTIVE:    "bg-green-500/10 text-green-400",
    ENDED:     "bg-muted/20 text-muted-foreground",
    RECORDING: "bg-blue-500/10 text-blue-400",
  };
  const STATUS_LABELS: Record<string, string> = {
    WAITING: "Ожидание", ACTIVE: "Активна", ENDED: "Завершена", RECORDING: "Запись",
  };

  function duration(s: typeof videoSessions[0]) {
    if (!s.startedAt || !s.endedAt) return "—";
    const mins = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
    return `${mins} мин`;
  }

  const active = videoSessions.filter(s => s.status === "ACTIVE").length;
  const total = videoSessions.length;

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Видеосессии</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active > 0 ? <span className="text-green-400">{active} активных</span> : "Нет активных"} · всего {total}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/30 border-b border-border/20">
            <tr>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Клиент → Практик</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Статус</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Комната</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Длительность</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Дата</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Запись</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {videoSessions.map(s => (
              <tr key={s.id} className="hover:bg-white/2">
                <td className="p-3">
                  <p className="text-sm font-medium">{s.booking.client.name}</p>
                  <p className="text-xs text-muted-foreground">→ {s.booking.practitioner.user.name}</p>
                </td>
                <td className="p-3">
                  <Badge className={`${STATUS_COLORS[s.status] ?? ""} text-xs`}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </td>
                <td className="p-3">
                  <code className="text-xs text-muted-foreground">{s.roomName.slice(0, 20)}...</code>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{duration(s)}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="p-3">
                  {s.recordingUrl ? (
                    <div>
                      <a href={s.recordingUrl} target="_blank"
                        className="text-xs text-primary hover:underline">⬇ Скачать</a>
                      {s.recordingExpiry && (
                        <p className="text-[10px] text-muted-foreground">
                          до {new Date(s.recordingExpiry).toLocaleDateString("ru-RU")}
                        </p>
                      )}
                    </div>
                  ) : <span className="text-xs text-muted-foreground/40">—</span>}
                </td>
              </tr>
            ))}
            {videoSessions.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Нет видеосессий</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
