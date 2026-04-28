"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { persistGuestResultDraftToAccount } from "@/lib/guest-result-cache";

interface AuthModalProps {
  toolName: string;
  onSuccess: () => void;
  onClose: () => void;
  initialMode?: "login" | "register";
  open: boolean;
}

export function AuthModal({ toolName, onSuccess, onClose, initialMode = "register", open }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) { toast.error("Заполните все поля"); return; }
    if (password.length < 8) { toast.error("Минимум 8 символов"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Ошибка регистрации"); return; }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) {
        await persistGuestResultDraftToAccount();
        toast.success("Аккаунт создан! Продолжаем...");
        onSuccess();
      } else {
        toast.error("Войдите в аккаунт вручную");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) {
        await persistGuestResultDraftToAccount();
        toast.success("Вход выполнен! Продолжаем...");
        onSuccess();
      } else {
        toast.error("Неверный email или пароль");
      }
    } catch { toast.error("Ошибка"); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="text-center">
            <p className="text-2xl mb-2">🔐</p>
            <DialogTitle>
              {mode === "register" ? "Создайте аккаунт" : "Войдите"}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {mode === "register"
                ? toolName === "записи к практику"
                  ? "Создайте аккаунт, чтобы завершить запись и получать уведомления по сессии."
                  : `Создайте аккаунт, чтобы сохранить результат «${toolName}» и вернуться к нему позже.`
                : toolName === "записи к практику"
                  ? "Войдите в аккаунт чтобы завершить запись."
                  : "Войдите, чтобы сохранить результат в кабинете."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="space-y-3">
          {mode === "register" && (
            <div>
              <label htmlFor="auth-name" className="sr-only">Имя</label>
              <input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                required
                className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="sr-only">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="sr-only">Пароль</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              required
              minLength={8}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "..." : mode === "register" ? "Создать аккаунт и продолжить" : "Войти и продолжить"}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setMode(mode === "register" ? "login" : "register")}
            className="text-primary hover:underline"
          >
            {mode === "register" ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-foreground transition-colors"
          >
            Закрыть
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
