export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PractitionerEthicsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="soft-h1 mb-6">Этический кодекс</h1>
      <div className="soft-card p-6 space-y-4">
        <p className="font-semibold text-[var(--soft-bordeaux)]">Принципы работы специалиста ETerapy</p>
        <ul className="space-y-3 text-sm text-[var(--soft-ink-soft)]">
          {[
            "Не давать ложных обещаний результата и не манипулировать страхами клиента.",
            "Не принимать оплату за пределами платформы ETerapy.",
            "Сохранять конфиденциальность клиентских сессий.",
            "Не работать в областях, выходящих за рамки своей квалификации — направлять к коллегам.",
            "Уважать отказ клиента продолжать работу без давления.",
            "Сообщать платформе о ситуациях, требующих экстренной помощи.",
          ].map((rule, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--soft-terracotta)]" />
              {rule}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--soft-ink-faint)] pt-2">
          Подписав этот кодекс при регистрации, вы подтвердили согласие со всеми его пунктами.
        </p>
      </div>
    </div>
  );
}
