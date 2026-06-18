"use client";

import { useState } from "react";
import { toast } from "sonner";

export function AgentOfferAcceptButton({ accepted }: { accepted: boolean }) {
  const [done, setDone] = useState(accepted);
  const [saving, setSaving] = useState(false);

  async function accept() {
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/agent-offer", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
        toast.success("Агентская оферта принята");
      } else {
        toast.error(data.error ?? "Не удалось принять оферту");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700">
        Оферта принята
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={accept}
      disabled={saving}
      className="soft-button soft-button-primary"
      style={{ minHeight: "2.25rem", padding: "0.5rem 1.1rem", fontSize: "0.875rem" }}
    >
      {saving ? "Принятие..." : "Принять агентскую оферту"}
    </button>
  );
}
