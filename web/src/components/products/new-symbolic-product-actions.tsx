"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionChoice, OptionScrollStrip } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { TarotSpreadCards, ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { LocationSuggestInput } from "@/components/products/location-suggest-input";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import type { NatalWheel } from "@/lib/esoteric-chart";
import type { TarotCard } from "@/lib/tarot-deck";
import type { TarotBirthCode } from "@/lib/tarot-birth-code";
import type { RussianLocality } from "@/lib/russian-localities";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";

function metadataValue<T>(result: SymbolicResult | null, key: string): T | null {
  const metadata = result?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const value = nested?.[key] ?? meta[key];
  return value && typeof value === "object" ? value as T : null;
}

const HORARY_FOCUS = ["покупка", "работа", "отношения", "деньги", "переезд", "срок", "другое"];
const HORARY_QUESTION_EXAMPLES: Record<string, string[]> = {
  default: ["Состоится ли важная встреча в назначенный день?", "Получу ли я ожидаемый ответ в течение недели?", "Разрешится ли эта ситуация до конца месяца?"],
  покупка: ["Состоится ли покупка этой квартиры до конца месяца?", "Подпишем ли мы договор по этому объекту в ближайшие две недели?", "Будет ли выбранный автомобиль удачной покупкой для меня?"],
  работа: ["Получу ли я предложение по этой вакансии?", "Сохранится ли моя текущая работа до конца года?", "Состоится ли моё повышение в ближайшие три месяца?"],
  отношения: ["Возобновятся ли наши отношения в ближайшие три месяца?", "Перейдёт ли это знакомство в серьёзные отношения?", "Произойдёт ли примирение после нашего разговора?"],
  деньги: ["Вернёт ли этот человек долг в оговорённый срок?", "Одобрят ли мне эту выплату в течение месяца?", "Получу ли я оплату по этому договору до конца недели?"],
  переезд: ["Состоится ли мой переезд в выбранный город этой осенью?", "Подойдёт ли мне именно этот вариант переезда?", "Удастся ли оформить документы для переезда в срок?"],
  срок: ["Когда завершится согласование этого проекта?", "Произойдёт ли ожидаемое событие до конца месяца?", "Будет ли вопрос решён до назначенной даты?"],
  другое: ["Состоится ли задуманное событие в выбранный срок?", "Получит ли эта ситуация ожидаемое продолжение?", "Будет ли принято решение в мою пользу?"],
};
const HORARY_LOCATION_EXAMPLES = [
  "Тула, Тульская область",
  "Казань, Республика Татарстан",
  "Сочи, Краснодарский край",
  "Екатеринбург, Свердловская область",
];
const HORARY_CONTEXT_EXAMPLES: Record<string, string[]> = {
  default: ["Что уже произошло и какой срок для вас важен", "Кто участвует и что изменилось перед вопросом"],
  покупка: ["Объект выбран, продавец ждёт решение до пятницы", "Переговоры идут две недели, есть конкурирующий покупатель"],
  работа: ["Собеседование прошло вчера, обещали ответить за неделю", "Руководитель сообщил о реорганизации, решения ещё нет"],
  отношения: ["Не общаемся две недели после конкретного разговора", "Знакомы три месяца, но статус отношений не обсуждали"],
  деньги: ["Срок возврата уже переносили один раз", "Документы поданы, решение обещали в течение месяца"],
  переезд: ["Есть предложение работы и выбран район", "Документы готовы, но решение зависит от жилья"],
  срок: ["Укажите обещанную дату и что задерживает процесс", "Назовите событие и уже известные ограничения"],
  другое: ["Коротко: факты, участники и важный срок", "Что уже известно и почему вопрос возник именно сейчас"],
};

function parseHoraryInput(userInput?: string | null) {
  return {
    question: userInput?.match(/^Вопрос:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    location: userInput?.match(/^Место:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    focus: userInput?.match(/^Категория:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    context: userInput?.match(/^Контекст:\s*(.+)$/imu)?.[1]?.trim() ?? "",
  };
}

export function HoraryActions({ creditCost }: { creditCost: number }) {
  const [question, setQuestion] = useState("");
  const [location, setLocation] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<RussianLocality | null>(null);
  const [context, setContext] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const questionPlaceholder = useRotatingPlaceholder(HORARY_QUESTION_EXAMPLES[focus ?? "default"] ?? HORARY_QUESTION_EXAMPLES.default, focus ?? "default");
  const contextPlaceholder = useRotatingPlaceholder(HORARY_CONTEXT_EXAMPLES[focus ?? "default"] ?? HORARY_CONTEXT_EXAMPLES.default, focus ?? "default");
  const locationPlaceholder = useRotatingPlaceholder(HORARY_LOCATION_EXAMPLES, "horary-location");
  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } = useSymbolicService("horary", (userInput) => {
    const restored = parseHoraryInput(userInput);
    setQuestion(restored.question);
    setLocation(restored.location);
    setSelectedLocation(null);
    setContext(restored.context);
    setFocus(HORARY_FOCUS.includes(restored.focus) ? restored.focus : null);
  });
  const wheel = metadataValue<NatalWheel>(result, "wheel");

  const submit = () => {
    if (!focus || question.trim().length < 12 || location.trim().length < 2) {
      setMessage("Выберите категорию, сформулируйте один точный вопрос и укажите текущее место.");
      return;
    }
    void generate([
      `Вопрос: ${question.trim()}`,
      `Место: ${location.trim()}`,
      selectedLocation ? `Координаты: ${selectedLocation.latitude}, ${selectedLocation.longitude}` : "",
      focus ? `Категория: ${focus}` : "",
      context.trim() ? `Контекст: ${context.trim()}` : "",
    ].filter(Boolean).join("\n"));
  };

  if (result?.resultText) {
    return <SymbolicResultScaffold productKey="horary" eyebrow="хорарная астрология · карта момента" heading="Ответ карты на ваш вопрос" recapSummary="Зафиксированный вопрос" recapRows={[{ label: "Вопрос", value: question }, { label: "Место", value: location }, ...(focus ? [{ label: "Категория", value: focus }] : []), ...(context ? [{ label: "Контекст", value: context }] : [])]} visual={wheel ? <ZodiacWheel wheel={wheel} /> : undefined} resultText={result.resultText} topic={question} creditCost={creditCost} repeat={{ ribbon: "новый вопрос", title: "Задать новый вопрос", description: "Новая формулировка фиксируется как отдельный вопрос и отдельный момент.", ctaLabel: "Начать" }} onStartNew={() => { reset(); setQuestion(""); setLocation(""); setSelectedLocation(null); setContext(""); setFocus(null); }} />;
  }

  return (
    <div className="soft-card product-order-surface" data-testid="horary-actions">
      <div className="product-order-head"><p className="soft-eyebrow">хорарная астрология · один вопрос, один момент</p></div>
      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Категория вопроса" label="о чём вопрос" hint="Категория помогает выбрать дом предмета вопроса; формулировка остаётся главной.">{HORARY_FOCUS.map((item) => <OptionChoice key={item} active={focus === item} disabled={status === "loading"} onClick={() => setFocus(item)}>{item}</OptionChoice>)}</OptionScrollStrip>
        <label className="soft-eyebrow product-question-label" htmlFor="horary-question">один точный вопрос</label>
        <textarea id="horary-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 500))} placeholder={questionPlaceholder} className="soft-question-input product-question-input min-h-28" disabled={status === "loading"} data-testid="horary-question" />
        <label className="soft-eyebrow product-question-label" htmlFor="horary-location">где вы находитесь сейчас</label>
        <LocationSuggestInput value={location} selected={selectedLocation} onChange={setLocation} onSelect={setSelectedLocation} placeholder={locationPlaceholder} disabled={status === "loading"} />
        <label className="soft-eyebrow product-question-label" htmlFor="horary-context">короткий контекст, необязательно</label>
        <textarea id="horary-context" value={context} onChange={(event) => setContext(event.target.value.slice(0, 800))} placeholder={contextPlaceholder} className="soft-question-input product-question-input min-h-20" disabled={status === "loading"} />
        <div className="rounded-2xl bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]"><p className="font-medium text-[var(--soft-ink)]">Точное время вопроса будет использовано автоматически</p><p className="mt-1">Карта строится для момента, когда вы отправляете сформулированный вопрос.</p></div>
        <div className="product-action-row">{hasEntitlement ? <Button onClick={submit} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="horary-start">{status === "loading" ? "Строим карту момента…" : "Зафиксировать вопрос"}<ArrowRight className="size-4" aria-hidden="true" /></Button> : <ProductPurchaseControls productKey="horary" label="Открыть хорарную карту" checkoutSource="horary-direct" creditCost={creditCost} onUnlocked={() => { setHasEntitlement(true); if (focus && question.trim() && location.trim()) submit(); }} />}</div>
      </div>
    </div>
  );
}

const TAROT_NUM_FOCUS = ["личность", "отношения", "призвание", "деньги", "сильная сторона", "тень"];
const TAROT_NUM_QUESTIONS: Record<string, string[]> = {
  default: ["Сначала выберите тему, которую хотите раскрыть", "Какой аспект вашей даты рождения сейчас важнее всего?"],
  личность: ["Как мои арканы проявляются в характере и решениях?", "В чём мой естественный способ действовать?"],
  отношения: ["Как мои арканы проявляются в близких отношениях?", "Какую повторяющуюся тему в отношениях показывают мои карты рождения?"],
  призвание: ["Как мои арканы раскрываются в работе и призвании?", "В какой роли мой потенциал проявляется сильнее?"],
  деньги: ["Как мои арканы влияют на отношение к деньгам?", "Где мой ресурс и риск в финансовых решениях?"],
  "сильная сторона": ["Какую сильную сторону мне важно использовать чаще?", "На какой внутренний ресурс указывают мои арканы?"],
  тень: ["Как выглядит теневая сторона моих арканов?", "Какой сценарий мешает мне двигаться вперёд?"],
};
const TAROT_NUM_NAMES = ["Анна", "Мария", "Елена"];
const TAROT_NUM_BIRTHS = ["12.04.1992", "03.11.1988", "27.06.1995"];

function tarotBirthCards(code: TarotBirthCode): TarotCard[] {
  return code.positions.map((position) => ({ ...position.card, position: position.label, meaning: position.card.upright, uprightMeaning: position.card.upright, reversedMeaning: position.card.reversedMeaning, reversed: false }));
}

function parseTarotNumerologyInput(userInput?: string | null) {
  return {
    name: userInput?.match(/^Имя:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    birth: userInput?.match(/^Дата рождения:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    focus: userInput?.match(/^Фокус:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    question: userInput?.match(/^Вопрос:\s*(.+)$/imu)?.[1]?.trim() ?? "",
  };
}

export function TarotNumerologyActions({ creditCost }: { creditCost: number }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [question, setQuestion] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const placeholderKey = focus ?? "default";
  const namePlaceholder = useRotatingPlaceholder(TAROT_NUM_NAMES, placeholderKey);
  const birthPlaceholder = useRotatingPlaceholder(TAROT_NUM_BIRTHS, placeholderKey);
  const questionPlaceholder = useRotatingPlaceholder(TAROT_NUM_QUESTIONS[placeholderKey] ?? TAROT_NUM_QUESTIONS.default, placeholderKey);
  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } = useSymbolicService("tarot-numerology", (userInput) => {
    const restored = parseTarotNumerologyInput(userInput);
    setName(restored.name);
    setBirth(restored.birth);
    setQuestion(restored.question);
    setFocus(TAROT_NUM_FOCUS.includes(restored.focus) ? restored.focus : null);
  });
  const code = metadataValue<TarotBirthCode>(result, "tarotBirthCode");
  const submit = () => {
    if (!focus || name.trim().length < 2 || !/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(birth.trim())) {
      setMessage("Выберите тему, укажите имя и полную дату рождения в формате ДД.ММ.ГГГГ.");
      return;
    }
    void generate([`Имя: ${name.trim()}`, `Дата рождения: ${birth.trim()}`, focus ? `Фокус: ${focus}` : "", question.trim() ? `Вопрос: ${question.trim()}` : ""].filter(Boolean).join("\n"));
  };
  if (result?.resultText) {
    return <SymbolicResultScaffold productKey="tarot-numerology" eyebrow="таро · карты рождения" heading="Ваши Арканы рождения" recapSummary="Данные расчёта" recapRows={[{ label: "Имя", value: name }, { label: "Дата", value: birth }, ...(focus ? [{ label: "Фокус", value: focus }] : []), ...(question ? [{ label: "Вопрос", value: question }] : [])]} visual={code ? <TarotSpreadCards cards={tarotBirthCards(code)} /> : undefined} resultText={result.resultText} topic={question || focus} creditCost={creditCost} repeat={{ ribbon: "новый расчёт", title: "Рассчитать другую дату", description: "Пара карт рождения будет рассчитана по новой дате.", ctaLabel: "Начать" }} onStartNew={() => { reset(); setName(""); setBirth(""); setQuestion(""); setFocus(null); }} />;
  }
  return (
    <div className="soft-card product-order-surface" data-testid="tarot-numerology-actions">
      <div className="product-order-head"><p className="soft-eyebrow">арканы рождения · карты Таро по дате</p></div>
      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Фокус Арканов рождения" label="что раскрыть подробнее" hint="Фокус меняет интерпретацию, но не расчёт арканов.">{TAROT_NUM_FOCUS.map((item) => <OptionChoice key={item} active={focus === item} disabled={status === "loading"} onClick={() => setFocus(item)}>{item}</OptionChoice>)}</OptionScrollStrip>
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-name">имя</label><input id="tarot-num-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} placeholder={namePlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} />
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-birth">дата рождения</label><input id="tarot-num-birth" value={birth} onChange={(event) => setBirth(event.target.value.slice(0, 10))} placeholder={birthPlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} />
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-question">ваш вопрос, необязательно</label><textarea id="tarot-num-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 600))} placeholder={questionPlaceholder} className="soft-question-input product-question-input min-h-24" disabled={status === "loading"} />
        <div className="product-action-row">{hasEntitlement ? <Button onClick={submit} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="tarot-numerology-start">{status === "loading" ? "Рассчитываем карты…" : "Узнать свои арканы"}<ArrowRight className="size-4" aria-hidden="true" /></Button> : <ProductPurchaseControls productKey="tarot-numerology" label="Узнать свои арканы" checkoutSource="tarot-numerology-direct" creditCost={creditCost} onUnlocked={() => { setHasEntitlement(true); if (name.trim() && birth.trim()) submit(); }} />}</div>
      </div>
    </div>
  );
}
