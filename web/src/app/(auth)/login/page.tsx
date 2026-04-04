"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TEST_ACCOUNTS = [
  { label: "Клиент", email: "client@test.eterapy.com", password: "test1234", href: "/dashboard" },
  { label: "Практик", email: "practitioner@test.eterapy.com", password: "test1234", href: "/dashboard/practitioner" },
  { label: "Админ", email: "admin@test.eterapy.com", password: "admin1234", href: "/admin" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "CredentialsSignin") toast.error("Неверный email или пароль");
  }, [searchParams]);

  async function doLogin(loginEmail: string, loginPassword: string, redirectTo: string) {
    setLoading(true);
    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      toast.error("Неверный email или пароль");
    } else {
      toast.success("Добро пожаловать!");
      router.push(redirectTo);
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password, "/dashboard");
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
                autoComplete="email"
                className="bg-background/50"
              />
              <Input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-background/50"
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Входим...
                  </span>
                ) : "Войти"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <Link href="/auth/forgot-password" className="hover:text-foreground transition-colors">
                Забыли пароль?
              </Link>
              <Link href="/register" className="text-primary hover:underline">
                Создать аккаунт
              </Link>
            </div>
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
                  onClick={() => doLogin(acc.email, acc.password, acc.href)}
                  disabled={loading}
                  className="rounded-lg border border-primary/30 bg-background/50 px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:opacity-50"
                >
                  <p className="font-medium text-primary">{acc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Пароль: <code className="text-primary">test1234</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
