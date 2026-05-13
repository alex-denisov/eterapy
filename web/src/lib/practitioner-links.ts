import { absoluteMainUrl } from "@/lib/subdomain";

export function practitionerPrecheckPath(slug: string) {
  return `/p/${encodeURIComponent(slug)}/precheck`;
}

export function practitionerPrecheckUrl(slug: string, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }
  const suffix = search.toString();
  return absoluteMainUrl(`${practitionerPrecheckPath(slug)}${suffix ? `?${suffix}` : ""}`);
}

export function practitionerWidgetScriptUrl(slug: string, widgetId = "profile-card") {
  return absoluteMainUrl(`/api/widgets/practitioner-precheck.js?slug=${encodeURIComponent(slug)}&widget=${encodeURIComponent(widgetId)}`);
}

export function practitionerWidgetSnippet(slug: string, widgetId = "profile-card") {
  return `<script async src="${practitionerWidgetScriptUrl(slug, widgetId)}"></script>`;
}

export function practitionerTelegramStartUrl(practitionerId: string) {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "eterapy_bot";
  return `https://t.me/${bot}?start=practitioner_${encodeURIComponent(practitionerId)}`;
}
