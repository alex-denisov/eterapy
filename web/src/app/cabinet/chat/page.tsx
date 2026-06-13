// B386 (M26) — страница чат-компаньона «Решить вопрос в чате» (кабинет).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loginUrl } from "@/lib/subdomain";
import { CompanionChatPanel } from "@/components/companion/companion-chat-panel";

export const dynamic = "force-dynamic";

export default async function CabinetChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ dialogueId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const sp = await searchParams;

  return (
    <main className="soft-clarity-page mx-auto w-full max-w-3xl px-4 py-8" data-testid="cabinet-chat-page">
      <p className="soft-eyebrow">поддержка в ритме разговора</p>
      <h1 className="soft-h1 mt-2">Разобрать вопрос в чате</h1>
      <p className="soft-lede mt-3 max-w-2xl">
        Спокойный разговор в своём темпе. Первые сообщения — бесплатно; дальше можно открыть сеанс. Это поддержка для размышления, а не медицинская или экстренная помощь.
      </p>
      <div className="mt-6">
        <CompanionChatPanel dialogueId={sp?.dialogueId ?? null} />
      </div>
    </main>
  );
}
