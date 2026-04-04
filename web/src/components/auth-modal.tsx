"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import Link from "next/link";

interface AuthModalProps {
  toolName: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function AuthModal({ toolName, onSuccess, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
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

      // Auto-login after registration
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) {
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
        toast.success("Вход выполнен! Продолжаем...");
        onSuccess();
      } else {
        toast.error("Неверный email или пароль");
      }
    } catch { toast.error("Ошибка"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-navy p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 text-center">
          <p className="text-2xl mb-2">🔐</p>
          <h2 className="font-heading text-xl font-bold">
            {mode === "register" ? "Создайте аккаунт" : "Войдите"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "register"
              ? `Чтобы получить результат «${toolName}», создайте бесплатный аккаунт. Это займёт 30 секунд.`
              : "Войдите, чтобы получить результат."}
          </p>
        </div>

        <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="space-y-3">
          {mode === "register" && (
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя" required
              className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email"
            className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль" required autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />

          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/90 disabled:opacity-50">
            {loading ? "..." : mode === "register" ? "Создать аккаунт и продолжить" : "Войти и продолжить"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <button onClick={() => setMode(mode === "register" ? "login" : "register")}
            className="text-primary hover:underline">
            {mode === "register" ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
          </button>
          <button onClick={onClose} className="hover:text-foreground transition-colors">Закрыть</button>
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
          Карта не нужна · Без обязательств
        </p>
      </div>
    </div>
  );
}
