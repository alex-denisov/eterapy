"use client";

import { useSyncExternalStore } from "react";

import { IMPERSONATION_MARKER_COOKIE } from "@/lib/impersonation.shared";
import { mainUrl } from "@/lib/subdomain";

/**
 * X2: глобальная плашка имперсонации. Стоит первым ребёнком Providers, сразу
 * под плашкой подтверждения почты и НАД шапкой, в обычном потоке — обе плашки
 * статичны, поэтому липкая шапка прижимается под ними, а не уезжает под них.
 *
 * INC-080 — ПОЧЕМУ ЭТО КЛИЕНТ. Раньше компонент был серверным и звал `auth()`.
 * Один такой вызов в корневом layout читает куки, а чтение кук в корне
 * переводит в динамический рендер ВЕСЬ сайт: в prerender-манифесте прода лежало
 * 14 адресов вместо четырёх сотен, каждая статья библиотеки собиралась заново на
 * каждый заход робота, и Cloudflare не мог закешировать HTML в принципе.
 *
 * Признак имперсонации берём из видимой метки (`eterapy-imp-on`), а не из
 * подписанного кука: плашка — это оформление, а не полномочие. Полномочия
 * остаются в httpOnly-куке и проверяются на сервере, как и раньше.
 */
export function ImpersonationBanner() {
  const active = useSyncExternalStore(
    () => () => undefined,
    () => document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(`${IMPERSONATION_MARKER_COOKIE}=1`)),
    () => false,
  );

  if (!active) return null;

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
