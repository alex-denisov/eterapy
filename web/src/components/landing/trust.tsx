import { Check, LockKeyhole, X } from "lucide-react";

const helps = [
  "сформулировать вопрос, когда трудно подобрать слова",
  "посмотреть на ситуацию с разных сторон",
  "отделить факты от чувств и предположений",
  "увидеть один безопасный следующий шаг",
  "сохранить инсайты в личной карте",
  "при необходимости найти специалиста",
];

const doesNotPromise = [
  "гарантировать, что события пойдут именно так",
  "вернуть человека, который уходит",
  "поставить диагноз или вылечить",
  "заменить психолога, врача или юриста",
  "принять решение за вас",
  "гарантировать конкретный результат",
];

const privacy = [
  ["Шифрование диалогов", "Все разборы шифруются на устройстве и в нашей базе"],
  ["Этический кодекс", "Каждый специалист подписывает кодекс перед публикацией"],
  ["Safety-сценарии", "Кризисные темы перенаправляются к экстренным службам"],
  ["Удаление в один клик", "Без писем в поддержку и форм отказа"],
];

export function TrustPromisesSection() {
  return (
    <section className="soft-shell py-12 md:py-20">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="soft-card p-7 md:p-8" style={{ background: "linear-gradient(150deg, #fffcf5, #f4d9c1)" }}>
          <div className="soft-eyebrow">мы помогаем</div>
          <h2 className="soft-h2 mt-3">сформулировать, услышать, увидеть варианты</h2>
          <div className="mt-6 grid gap-3">
            {helps.map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm leading-relaxed text-[var(--soft-ink)]">
                <Check className="mt-0.5 size-5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="soft-card-flat p-7 md:p-8">
          <div className="soft-eyebrow">мы не обещаем</div>
          <h2 className="soft-h2 mt-3">того, чего никто честно обещать не может</h2>
          <div className="mt-6 grid gap-3">
            {doesNotPromise.map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                <X className="mt-0.5 size-5 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustPrivacySection() {
  return (
    <section className="soft-shell py-12 md:py-20">
      <div className="soft-card soft-dark-panel p-7 md:p-10">
        <div className="grid gap-8 md:grid-cols-[1.08fr_1fr] md:items-center">
          <div>
            <div className="soft-eyebrow text-[#f4d9c1]/70">почему нам доверяют</div>
            <h2 className="soft-h1 mt-3">
              Приватность как <span className="italic text-[#f4d9c1]">основа</span>, а не пункт меню
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#e8c4b8]">
              Мы не показываем рекламу. Не продаём данные. Не пишем имена в карточках для шеринга.
              Любой разбор можно удалить одним кликом.
            </p>
          </div>
          <div className="grid gap-4">
            {privacy.map(([title, text]) => (
              <div key={title} className="flex items-start gap-3">
                <LockKeyhole className="mt-1 size-5 shrink-0 text-[#f4d9c1]" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-[#fbf0e1]">{title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-[#e8c4b8]">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use TrustPromisesSection + TrustPrivacySection instead */
export function TrustSection() {
  return (
    <>
      <TrustPromisesSection />
      <TrustPrivacySection />
    </>
  );
}
