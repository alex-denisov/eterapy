"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function AdminSettingsClient({
  email,
  name,
  role,
}: {
  email: string;
  name: string;
  role: string;
}) {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("Пароли не совпадают"); return; }
    if (newPwd.length < 8) { toast.error("Минимум 8 символов"); return; }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Пароль изменён");
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка"); }
    finally { setSavingPwd(false); }
  }

  return (
    <div className="space-y-6">
      {/* Аккаунт */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Аккаунт</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Имя</p>
              <p className="text-sm font-medium">{name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Email</p>
              <p className="text-sm font-medium">{email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Роль</p>
              <p className="text-sm font-medium">
                {role === "SUPERADMIN" ? "Суперадминистратор" : "Администратор"}
              </p>
            </div>
          </div>
          {role === "ADMIN" && (
            <p className="mt-4 text-xs text-muted-foreground/70">
              Для изменения имени или email обратитесь к суперадминистратору.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Безопасность */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Безопасность</h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Текущий пароль</label>
              <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete="current-password" className="bg-card/50" name="settings-curr-pwd" data-form-type="other" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Новый пароль</label>
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                autoComplete="new-password" className="bg-card/50" name="settings-new-pwd" data-form-type="other" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Повторите</label>
              <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password" className="bg-card/50" name="settings-confirm-pwd" data-form-type="other" />
            </div>
            <Button type="submit" variant="outline" disabled={savingPwd || !currentPwd || !newPwd}>
              {savingPwd ? "Сохранение..." : "Изменить пароль"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
