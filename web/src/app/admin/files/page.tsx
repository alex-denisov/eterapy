export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { FilesTable, type StoredFileRow } from "./files-table";

export default async function AdminFilesPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const files = await db.storedFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { name: true, email: true } } },
  });

  const totalMB = files.reduce((sum, f) => sum + f.sizeBytes, 0) / 1024 / 1024;

  const rows: StoredFileRow[] = files.map((f) => ({
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    path: f.path,
    kind: f.kind,
    userName: f.user.name ?? "—",
    userEmail: f.user.email ?? "",
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
  }));

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Файлы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {files.length} файлов · {totalMB.toFixed(1)} МБ total
          </p>
        </div>
      </div>

      <FilesTable rows={rows} />
    </div>
  );
}
