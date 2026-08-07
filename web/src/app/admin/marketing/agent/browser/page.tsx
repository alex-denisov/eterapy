export const dynamic = "force-dynamic";

/**
 * B698 — окно входа владельца в Дзен.
 *
 * Показывает живой экран браузерного сервиса. Сам сервис слушает WireGuard и в
 * интернет не выходит: до окна доходит только этот маршрут, и только для
 * SUPERADMIN. WebSocket носит nginx (`deploy/nginx-marketing-browser.conf`) —
 * Next его проксировать не умеет, поэтому путь `/ops/browser/` живёт на фронте,
 * а не в приложении.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AdminHero } from "../../../admin-analytics-ui";
import { dzenBrowserHealth } from "@/lib/marketing/browser-publisher";

const VNC_PATH = "/ops/browser/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=ops/browser/websockify";

export default async function DzenBrowserSessionPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const health = await dzenBrowserHealth();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AdminHero eyebrow="площадки без API" title="Вход в Дзен под аккаунтом владельца">
        Это живое окно браузера на сервисе. Войдите в Яндекс ID — капчу и код из
        СМС проходит человек, автоматизировать их мы не будем. После входа
        профиль сохраняется в томе и переживает выкатки: повторно входить не
        нужно, пока Яндекс не разлогинит сессию сам.{" "}
        <Link className="font-semibold text-blue-700 hover:underline" href="/admin/marketing/agent">
          Вернуться к агенту
        </Link>
      </AdminHero>

      <div
        className="mt-4 rounded-lg border px-3 py-3 text-sm"
        data-testid="dzen-browser-state"
        data-authorized={health.authorized ? "true" : "false"}
      >
        {health.authorized
          ? `Сессия жива: Дзен узнаёт аккаунт ${health.account ?? "владельца"}, выпуск пойдёт браузером.`
          : `Сессия не готова: ${health.reason ?? "причина не названа"}.`}
      </div>

      {health.reachable ? (
        <>
          {/*
            Запасной путь — не украшение. Рамку молча режет любая политика,
            запрещающая вставку: своя CSP (так и было до B698 — `frame-src` без
            `'self'`), расширение браузера, корпоративный прокси. Отдельная
            вкладка не зависит ни от одной из них, а вход владельцу нужен
            здесь и сейчас.
          */}
          <p className="mt-4 text-sm">
            <a
              className="font-semibold text-blue-700 hover:underline"
              href={VNC_PATH}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть окно отдельной вкладкой
            </a>
            <span className="ml-2 text-[var(--soft-ink-faint)]">
              — если рамка ниже осталась пустой.
            </span>
          </p>
          <iframe
            title="Окно браузера"
            src={VNC_PATH}
            className="mt-4 h-[80vh] w-full rounded-lg border border-[var(--soft-paper-edge)] bg-white"
          />
        </>
      ) : (
        <p className="mt-4 text-sm text-red-700">
          Браузерный сервис недоступен, показывать нечего. Проверьте адрес и
          маркер в настройках площадки Dzen и состояние контейнера
          <code className="mx-1">marketing-browser</code>.
        </p>
      )}
    </main>
  );
}
