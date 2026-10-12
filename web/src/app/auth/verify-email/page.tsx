"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { authLink, readAuthReturn } from "@/lib/auth-return";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const returnContext = readAuthReturn(searchParams);
  const [welcomeGranted, setWelcomeGranted] = useState(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">(!token ? "error" : "loading");
  const [message, setMessage] = useState(!token ? "Ссылка недействительна." : "");

  useEffect(() => {
    if (!token) return; // already set to error

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setWelcomeGranted(data.welcomeGranted === true);
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.error || "Ошибка подтверждения.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Ошибка сети. Попробуйте снова.");
      });
  }, [token]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {status === "loading" && (
        <>
          <span className="animate-pulse text-4xl text-primary">✦</span>
          <p className="mt-4 text-muted-foreground">Проверяем ссылку...</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="text-5xl">✅</div>
          <h1 className="mt-4 font-heading text-2xl font-bold">Email подтверждён!</h1>
          <p className="mt-2 text-muted-foreground">
            {welcomeGranted ? "Баланс: 3 балла в подарок. " : ""}
            {returnContext.next ? "Войдите, и вернём вас к услуге." : "Теперь вы можете войти в аккаунт."}
          </p>
          <Link href={authLink("/login", returnContext)} className={cn(buttonVariants(), "mt-6")} data-testid="verify-continue">
            {returnContext.next ? "Продолжить" : "Войти"}
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <div className="text-5xl">❌</div>
          <h1 className="mt-4 font-heading text-2xl font-bold">Не получилось</h1>
          <p className="mt-2 text-muted-foreground">{message}</p>
          <div className="mt-6 flex gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "border-border/40 text-muted-foreground")}>
              Войти
            </Link>
            <Link href="/register" className={cn(buttonVariants())}>
              Зарегистрироваться снова
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
