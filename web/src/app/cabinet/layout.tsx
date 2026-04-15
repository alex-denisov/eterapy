import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";
import { loginUrl, mainUrl } from "@/lib/subdomain";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  const role = session.user?.role ?? "CLIENT";

  // Проверяем режим имперсонации
  const cookieStore = await cookies();
  const isImpersonating =
    cookieStore.has("admin-impersonating") ||
    cookieStore.has("admin-session-backup") ||
    cookieStore.has("__Host-admin-session-backup");

  return (
    <>
      {isImpersonating && (
        <div className="sticky top-0 z-[100] bg-amber-500 text-black text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-3">
          <span>👁️ Режим имперсонации — вы видите кабинет от имени другого пользователя</span>
          <a
            href={mainUrl("/api/admin/stop-impersonate")}
            className="underline font-bold hover:no-underline"
          >
            ← Вернуться
          </a>
        </div>
      )}
      <CabinetShell role={role} user={session.user}>{children}</CabinetShell>
    </>
  );
}
