import { NotificationBell } from "@/components/notification-bell";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P1 — appbar мобильного кокпита практика, 1-в-1 блок .appbar из
// docs/Design/mockups/practitioner-*.html: градиентный аватар с инициалами,
// имя + чип тарифа, подзаголовок и колокольчик-iconbtn (реальный
// NotificationBell, пере-стилизованный через .pcab-iconbtn-slot).
// Повторяется на главных вкладках (Сегодня/Клиенты/Календарь/Финансы);
// «Ещё» и детальные экраны рендерят свой верх по своим макетам.

export function PractitionerAppbar({
  initials,
  name,
  tierLabel,
  subtitle,
}: {
  initials: string;
  name: string;
  tierLabel: string;
  subtitle: string | null;
}) {
  return (
    <div className="pcab-appbar" data-testid="pcab-appbar">
      <div className="pcab-avatar" aria-hidden="true">{initials}</div>
      <div className="pcab-appbar-id">
        <div className="pcab-appbar-name">
          {name}
          <span className="pcab-tier">{tierLabel}</span>
        </div>
        {subtitle && <div className="pcab-appbar-sub truncate">{subtitle}</div>}
      </div>
      <div className="pcab-iconbtn-slot">
        <NotificationBell variant="header" settingsHref={appUrl("/practitioner/settings?tab=notifications")} />
      </div>
    </div>
  );
}
