export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

async function getStats() {
  const [users, practitioners, bookings, auditLogs, notifPrefs, telegramLinked] = await Promise.all([
    db.user.count(),
    db.practitioner.count(),
    db.booking.count(),
    db.auditLog.count(),
    db.notificationPreference.count(),
    db.user.count({ where: { telegramId: { not: null } } }),
  ]);
  return { users, practitioners, bookings, auditLogs, notifPrefs, telegramLinked };
}

export default async function AdminSystemPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const stats = await getStats();

  const env = {
    nodeEnv: process.env.NODE_ENV ?? "—",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "—",
    hasResend: !!process.env.RESEND_API_KEY,
    hasOpenRouter: !!process.env.OPENROUTER_API_KEY,
    hasLiveKit: !!process.env.LIVEKIT_API_KEY,
    hasTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
    hasGoogle: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    hasVK: !!(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET),
    hasCronSecret: !!process.env.CRON_SECRET,
  };

  return (
    <div className="px-6 py-8 max-w-4xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Система</h1>
      <p className="text-sm text-muted-foreground mb-8">Статус сервисов и конфигурация платформы</p>

      {/* Статистика БД */}
      <section className="mb-8">
        <h2 className="font-semibold mb-4">📊 База данных</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Пользователей", value: stats.users },
            { label: "Практиков", value: stats.practitioners },
            { label: "Бронирований", value: stats.bookings },
            { label: "Записей в логах", value: stats.auditLogs },
            { label: "Настроек уведомлений", value: stats.notifPrefs },
            { label: "Telegram привязок", value: stats.telegramLinked },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-border/30 bg-card/20 px-4 py-3">
              <p className="text-2xl font-bold text-primary">{stat.value.toLocaleString("ru")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Статус сервисов */}
      <section className="mb-8">
        <h2 className="font-semibold mb-4">🔌 Статус сервисов</h2>
        <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
          {[
            { name: "Email (Resend)",      ok: env.hasResend,      hint: "RESEND_API_KEY" },
            { name: "AI (OpenRouter)",     ok: env.hasOpenRouter,  hint: "OPENROUTER_API_KEY" },
            { name: "Видеочат (LiveKit)", ok: env.hasLiveKit,     hint: "LIVEKIT_API_KEY" },
            { name: "Telegram Bot",        ok: env.hasTelegram,    hint: "TELEGRAM_BOT_TOKEN" },
            { name: "Google OAuth",        ok: env.hasGoogle,      hint: "GOOGLE_CLIENT_ID + SECRET" },
            { name: "VK OAuth",            ok: env.hasVK,          hint: "VK_CLIENT_ID + SECRET" },
            { name: "Cron-напоминания",    ok: env.hasCronSecret,  hint: "CRON_SECRET" },
          ].map(svc => (
            <div key={svc.name} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`text-lg ${svc.ok ? "text-green-400" : "text-muted-foreground/30"}`}>
                  {svc.ok ? "●" : "○"}
                </span>
                <span className="text-sm font-medium">{svc.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${svc.ok ? "text-green-400" : "text-muted-foreground"}`}>
                  {svc.ok ? "Настроен" : "Не настроен"}
                </span>
                {!svc.ok && <code className="text-[10px] text-muted-foreground/40">{svc.hint}</code>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Окружение */}
      <section className="mb-8">
        <h2 className="font-semibold mb-4">⚙️ Конфигурация</h2>
        <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
          {[
            { key: "Режим",        value: env.nodeEnv },
            { key: "URL приложения", value: env.appUrl },
          ].map(row => (
            <div key={row.key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">{row.key}</span>
              <code className="text-sm">{row.value}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Cron инструкция */}
      <section>
        <h2 className="font-semibold mb-4">⏰ Cron-задачи</h2>
        <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3 text-sm">
          <p className="text-muted-foreground">Для автоматических напоминаний о сессиях настройте вызов раз в 15 минут:</p>
          <code className="block bg-card/40 rounded-lg px-3 py-2 text-xs text-primary">
            GET {env.appUrl}/api/cron/reminders
            <br/>
            Authorization: Bearer {"{CRON_SECRET}"}
          </code>
          <p className="text-xs text-muted-foreground">
            Используйте cron-job.org (бесплатно) или systemd timer на сервере.
          </p>
        </div>
      </section>
    </div>
  );
}
