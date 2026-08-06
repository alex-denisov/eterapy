/**
 * B693 — разбор маркера Meta без перехода по ссылкам.
 *
 * Владелец 2026-08-06: «Запрашивать у меня действия по нажатию на ссылки в
 * суперадминке — неэффективно … нужны другие способы получения этих данных».
 *
 * Другой способ документирован самой Meta: маркер системного пользователя
 * бизнес-портфеля выпускается в кабинете бизнеса, не истекает и предназначен
 * ровно для «программных действий без участия человека». Его достаточно один
 * раз внести строкой — id Страницы и `instagram_business_account_id` вычисляем
 * мы сами обходом графа.
 *
 * GET  — опись по УЖЕ сохранённому маркеру: что он видит на самом деле.
 *        Ничего не меняет, поэтому это и есть «подтверждение» адресата.
 * POST — разобрать присланный маркер и, если брендовая страница найдена,
 *        сохранить маркер СТРАНИЦЫ и id бизнес-аккаунта Instagram.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { META_BRAND_HANDLES } from "@/lib/marketing/meta-brand-account";
import {
  fetchMetaPageInventory,
  resolveMetaBrandPage,
  type MetaPageInventory,
} from "@/lib/marketing/meta-page-resolver";
import {
  marketingPlatformValue,
  saveMarketingPlatformConfig,
} from "@/lib/marketing/platform-settings";

/**
 * Маркеры наружу не отдаются НИКОГДА, даже суперадмину: опись нужна, чтобы
 * увидеть адресата, а не чтобы вынести секрет в браузер и в журнал сети.
 */
function redact(inventory: MetaPageInventory) {
  return {
    source: inventory.source,
    entries: inventory.entries.map((entry) => ({
      pageId: entry.pageId,
      pageName: entry.pageName,
      hasPageToken: Boolean(entry.pageToken),
      igUserId: entry.igUserId,
      igUsername: entry.igUsername,
    })),
  };
}

async function requireSuperadmin() {
  const session = await auth();
  return session?.user?.role === "SUPERADMIN" && session.user.id ? session.user.id : null;
}

export async function GET() {
  if (!await requireSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const token = await marketingPlatformValue("INSTAGRAM_ACCESS_TOKEN").catch(() => null);
  if (!token) {
    return NextResponse.json({ error: "Маркер Instagram не сохранён" }, { status: 409 });
  }
  try {
    const inventory = await fetchMetaPageInventory(token);
    const brand = resolveMetaBrandPage(inventory);
    return NextResponse.json({
      expectedHandle: META_BRAND_HANDLES.instagram,
      brandPageId: brand?.pageId ?? null,
      inventory: redact(inventory),
    });
  } catch (error) {
    // Отказ площадки — это «не знаем», а не «страниц нет». Молчание сети не
    // должно читаться как доказательство отсутствия бренда.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const actorId = await requireSuperadmin();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as { token?: unknown; apply?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Маркер не передан" }, { status: 400 });

  let inventory: MetaPageInventory;
  try {
    inventory = await fetchMetaPageInventory(token);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  const brand = resolveMetaBrandPage(inventory);
  if (!brand) {
    // Опись возвращается и при неудаче — по ней видно, ЧТО маркер видит вместо
    // бренда. Без неё «страница не найдена» не отличается от «маркер не тот».
    return NextResponse.json({
      applied: false,
      expectedHandle: META_BRAND_HANDLES.instagram,
      error: `Маркер не видит страницу с аккаунтом «${META_BRAND_HANDLES.instagram}»`,
      inventory: redact(inventory),
    }, { status: 422 });
  }

  if (body?.apply !== true) {
    return NextResponse.json({
      applied: false,
      brandPageId: brand.pageId,
      igUserId: brand.igUserId,
      inventory: redact(inventory),
    });
  }

  if (!brand.pageToken) {
    return NextResponse.json({
      applied: false,
      error: "Страница найдена, но маркер Страницы не выдан: у маркера нет доступа к её задачам",
      inventory: redact(inventory),
    }, { status: 422 });
  }

  await saveMarketingPlatformConfig({
    actorId,
    platform: "Instagram",
    enabled: true,
    values: {
      INSTAGRAM_ACCESS_TOKEN: brand.pageToken,
      INSTAGRAM_USER_ID: brand.igUserId ?? "",
      INSTAGRAM_PAGE_ID: brand.pageId,
      // Хост публикации зависит от РОДА маркера: маркер Страницы работает через
      // graph.facebook.com, маркер Instagram Login — через graph.instagram.com.
      INSTAGRAM_TOKEN_KIND: "page",
      // Маркер Страницы, полученный из долгоживущего пользовательского, не
      // истекает — срок больше не сторожим.
      INSTAGRAM_TOKEN_EXPIRES_AT: "",
    },
  });

  return NextResponse.json({
    applied: true,
    brandPageId: brand.pageId,
    igUserId: brand.igUserId,
    inventory: redact(inventory),
  });
}
