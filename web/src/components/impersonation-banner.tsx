import { auth } from "@/lib/auth";
import { mainUrl } from "@/lib/subdomain";

/**
 * X2: global impersonation banner. Rendered at the very top of the document
 * (as the first child of Providers, right under the email-verification banner
 * and ABOVE the public-shell-header) in normal flow — both banners are static
 * so the sticky header pins below them and never slides underneath.
 *
 * Impersonation is detected server-side: `session.user.impersonatedBy` is set
 * by the host-aware `auth()` wrapper, not the NextAuth session callback, so a
 * client `useSession()` cannot see it — hence this async server component.
 */
export async function ImpersonationBanner() {
  const session = await auth();
  if (!session?.user?.impersonatedBy) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black">
      <span>👁️ Режим имперсонации — вы видите кабинет от имени другого пользователя</span>
      <a
        href={mainUrl("/api/admin/stop-impersonate")}
        className="font-bold underline hover:no-underline"
      >
        ← Вернуться
      </a>
    </div>
  );
}
