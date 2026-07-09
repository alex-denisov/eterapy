import Link from "next/link";
import { Link2, Plus, Users } from "lucide-react";
import { PractitionerAppbar } from "@/components/cabinet/practitioner-appbar";
import type { PractitionerAppbarData } from "@/lib/practitioner-appbar";
import { ClientsMobileList } from "./clients-mobile-list";
import type { ClientListRow } from "./clients-list-client";

// B466 R9-4 P2 — мобильный экран «Клиенты» кокпита практика, разметка 1-в-1
// по docs/Design/mockups/practitioner-clients-list.html и -clients-empty.html:
// appbar → eyebrow/greeting → (поиск+чипы+список | пустое состояние).
// Презентационный серверный компонент; интерактив вынесен в ClientsMobileList.

export function PractitionerClientsMobile({
  appbar,
  rows,
  inviteHref,
  proposeHref,
}: {
  appbar: PractitionerAppbarData;
  rows: ClientListRow[];
  inviteHref: string;
  proposeHref: string;
}) {
  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-clients-mobile">
      <PractitionerAppbar
        initials={appbar.initials}
        name={appbar.name}
        tierLabel={appbar.tierLabel}
        subtitle={appbar.subtitle}
      />

      <div style={{ marginTop: 16 }}>
        <div className="pcab-eyebrow">Кабинет практика</div>
        <h1 className="pcab-greeting">Клиенты</h1>
      </div>

      {rows.length === 0 ? (
        <div className="pcab-empty" data-testid="practitioner-clients-empty-mobile">
          <div className="pcab-empty-ill" aria-hidden="true">
            <Users width={42} height={42} strokeWidth={1.5} />
          </div>
          <div className="pcab-empty-t">Клиентов пока нет</div>
          <div className="pcab-empty-s">
            Они появятся здесь после первой записи. Поделитесь ссылкой для записи или предложите
            время клиенту сами.
          </div>
          <div className="pcab-empty-cta">
            <Link href={inviteHref} className="pcab-btn pcab-btn-primary">
              <Link2 width={15} height={15} aria-hidden="true" />
              Ссылка для записи
            </Link>
            <Link href={proposeHref} className="pcab-btn pcab-btn-ghost">
              <Plus width={15} height={15} aria-hidden="true" />
              Записать клиента
            </Link>
          </div>
        </div>
      ) : (
        <ClientsMobileList rows={rows} />
      )}
    </div>
  );
}
