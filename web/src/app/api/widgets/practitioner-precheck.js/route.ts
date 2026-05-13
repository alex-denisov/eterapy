import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PractitionerStatus } from "@prisma/client";
import db from "@/lib/db";
import { practitionerPrecheckUrl } from "@/lib/practitioner-links";

function jsString(value: string) {
  return JSON.stringify(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`/g, "&#96;")
    .replace(/\$/g, "&#36;");
}

function script(payload: {
  name: string;
  title: string;
  href: string;
  priceLabel: string;
}) {
  return `(() => {
  const current = document.currentScript;
  const root = document.createElement("div");
  root.setAttribute("data-eterapy-practitioner-widget", "true");
  root.innerHTML = \`
    <a href=${jsString(payload.href)} target="_blank" rel="noopener noreferrer" style="display:block;max-width:360px;text-decoration:none;border:1px solid #eadfd7;border-radius:18px;background:#fff8f1;color:#3e2b2e;padding:18px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 16px 42px rgba(62,43,46,.12)">
      <span style="display:block;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#9f6b5f">ETerapy · предразбор</span>
      <strong style="display:block;margin-top:8px;font-size:19px;line-height:1.2;color:#6d2832">${escapeHtml(payload.name)}</strong>
      <span style="display:block;margin-top:4px;font-size:13px;line-height:1.5;color:#776766">${escapeHtml(payload.title)}</span>
      <span style="display:block;margin-top:12px;font-size:13px;color:#776766">${payload.priceLabel}</span>
      <span style="display:inline-flex;margin-top:14px;border-radius:999px;background:#8f4f3f;color:#fff;padding:9px 13px;font-size:13px;font-weight:700">Начать предразбор</span>
    </a>\`;
  if (current && current.parentNode) current.parentNode.insertBefore(root, current);
  window.dispatchEvent(new CustomEvent("eterapy:analytics", { detail: { event: "practitioner_widget_rendered", surface: "embedded_widget" }}));
})();`;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  const widgetId = request.nextUrl.searchParams.get("widget")?.trim() || "profile-card";
  if (!slug) {
    return new NextResponse("/* ETerapy widget: missing slug */", {
      status: 400,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const practitioner = await db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
  });
  if (!practitioner) {
    return new NextResponse("/* ETerapy widget: practitioner not found */", {
      status: 404,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const rate = practitioner.priceRates[0];
  const price = rate?.priceRub ?? practitioner.pricePerSession;
  const duration = rate?.durationMin ?? practitioner.sessionDuration;
  const href = practitionerPrecheckUrl(practitioner.slug, {
    source: "practitioner",
    channel: "embedded-widget",
    practitioner: practitioner.slug,
    practitionerId: practitioner.id,
    widget: widgetId,
    entry: "practitioner_precheck",
  });

  return new NextResponse(script({
    name: practitioner.user.name,
    title: practitioner.title,
    href,
    priceLabel: `от ${price.toLocaleString("ru-RU")} ₽ · ${duration} минут`,
  }), {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
