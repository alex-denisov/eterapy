"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TEST_ACCOUNTS = [
  { label: "Клиент", email: "client@test.eterapy.com", password: "test1234", href: "/dashboard" },
  { label: "Практик", email: "practitioner@test.eterapy.com", password: "test1234", href: "/dashboard/practitioner" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "CredentialsSignin") setError("Неверный email или пароль");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Неверный email или пароль");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function loginAs(account: typeof TEST_ACCOUNTS[0]) {
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email: account.email,
      password: account.password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Ошибка входа в тест-аккаунт");
    } else {
      router.push(account.href);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Вход в ETerapy</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/50"
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background/50"
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Входим..." : "Войти"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Зарегистрироваться
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* Тест-аккаунты — только в dev */}
        {process.env.NODE_ENV === "development" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-3 text-xs font-medium text-primary">🧪 Тест-аккаунты (только dev)</p>
            <div className="grid grid-cols-2 gap-2">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => loginAs(acc)}
                  disabled={loading}
                  className="rounded-lg border border-primary/30 bg-background/50 px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:opacity-50"
                >
                  <p className="font-medium text-primary">{acc.label}</p>
                  <p className="text-xs text-muted-foreground">{acc.email}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Пароль для обоих: <code className="text-primary">test1234</code></p>
          </div>
        )}
      </div>
    </div>
  );
}
