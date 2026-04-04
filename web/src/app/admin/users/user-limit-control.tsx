"use client";

import { useState } from "react";
import { toast } from "sonner";

export function UserLimitControl({
  userId,
  currentLimit,
  role,
}: {
  userId: string;
  currentLimit: number | null;
  role: string;
}) {
  const [limit, setLimit] = useState<string>(
    currentLimit === 0 ? "unlimited" : currentLimit === null ? "3" : String(currentLimit)
  );
  const [saving, setSaving] = useState(false);

  if (role !== "CLIENT") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const display = limit === "unlimited" ? "∞ безлимит" : `${limit}/мес`;

  async function handleChange(newLimit: string) {
    setLimit(newLimit);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, freeToolsLimit: newLimit }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Лимит обновлён: ${newLimit === "unlimited" ? "безлимит" : newLimit + " сессий"}`);
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={limit} onChange={(e) => handleChange(e.target.value)} disabled={saving}
        className="rounded border border-border/30 bg-background/50 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-50">
        <option value="3">3 / мес</option>
        <option value="5">5 / мес</option>
        <option value="10">10 / мес</option>
        <option value="30">30 / мес</option>
        <option value="unlimited">Безлимит</option>
      </select>
      <span className="text-xs text-muted-foreground">{display}</span>
    </div>
  );
}
