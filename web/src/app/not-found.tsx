import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";

export default async function NotFound() {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role ?? "GUEST";

  const homeHref = role === "PRACTITIONER" ? "/cabinet/practitioner"
    : role === "ADMIN" ? "/admin"
    : session ? "/cabinet"
    : "/";

  const homeLabel = role === "PRACTITIONER" ? "В кабинет" : session ? "В кабинет" : "На главную";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-heading text-8xl font-bold text-primary/20">404</p>
      <h1 className="mt-4 font-heading text-2xl font-bold">Страница не найдена</h1>
      <p className="mt-2 text-muted-foreground">
        Возможно, она была удалена или вы перешли по неверной ссылке.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href={homeHref} className={cn(buttonVariants())}>
          {homeLabel}
        </Link>
        {role !== "PRACTITIONER" && role !== "ADMIN" && (
          <Link href="/practitioners" className={cn(buttonVariants({ variant: "outline" }), "border-border/40 text-muted-foreground")}>
            Найти практика
          </Link>
        )}
      </div>
    </div>
  );
}
