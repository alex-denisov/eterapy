import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export default async function AdminFilesPage() {
  const session = await auth();
  // @ts-expect-error custom
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const files = await db.storedFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });

  const totalMB = files.reduce((sum, f) => sum + f.sizeBytes, 0) / 1024 / 1024;

  const byKind = files.reduce((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Файлы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {files.length} файлов · {totalMB.toFixed(1)} МБ total
          </p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {Object.entries(byKind).map(([kind, count]) => (
            <span key={kind}>{kind}: {count}</span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/30 border-b border-border/20">
            <tr>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Файл</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Тип</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Пользователь</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Размер</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Дата</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {files.map(f => (
              <tr key={f.id} className="hover:bg-white/2">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {f.mimeType.startsWith("image/") ? (
                      <a href={f.path} target="_blank">
                        <img src={f.path} alt="" className="h-8 w-8 rounded object-cover border border-border/20" />
                      </a>
                    ) : (
                      <div className="h-8 w-8 rounded bg-card/40 flex items-center justify-center text-lg">
                        {f.mimeType.includes("pdf") ? "📄" : f.mimeType.includes("audio") ? "🎵" : "📎"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium max-w-[180px]">{f.originalName}</p>
                      <p className="text-[10px] text-muted-foreground/50">{f.mimeType}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`text-xs rounded px-1.5 py-0.5 ${
                    f.kind === "AVATAR" ? "bg-primary/10 text-primary" :
                    f.kind === "DOCUMENT" ? "bg-blue-500/10 text-blue-400" :
                    "bg-purple-500/10 text-purple-400"
                  }`}>{f.kind}</span>
                </td>
                <td className="p-3 text-xs">
                  <p className="font-medium">{f.user.name}</p>
                  <p className="text-muted-foreground text-[10px]">{f.user.email}</p>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {(f.sizeBytes / 1024).toFixed(0)} КБ
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
            {files.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">Файлов нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
