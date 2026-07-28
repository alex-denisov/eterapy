"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function MarketingNotificationsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const response = await fetch("/api/admin/marketing/agent/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationsEnabled: !enabled }),
    });
    if (!response.ok) {
      toast.error("Не удалось изменить рекламную рассылку");
      return;
    }
    toast.success(!enabled ? "Рекламная рассылка включена" : "Рекламная рассылка выключена");
    startTransition(() => router.refresh());
  }

  return (
    <button className="soft-admin-action" data-variant={enabled ? "danger" : "primary"} disabled={pending} onClick={() => void toggle()}>
      {enabled ? "Выключить рассылку" : "Включить рассылку"}
    </button>
  );
}
