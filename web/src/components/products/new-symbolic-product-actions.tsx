"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionChoice, OptionScrollStrip } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { TarotSpreadCards, ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import type { NatalWheel } from "@/lib/esoteric-chart";
import type { TarotCard } from "@/lib/tarot-deck";
import type { TarotBirthCode } from "@/lib/tarot-birth-code";

function metadataValue<T>(result: SymbolicResult | null, key: string): T | null {
  const metadata = result?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const value = nested?.[key] ?? meta[key];
  return value && typeof value === "object" ? value as T : null;
}

const HORARY_FOCUS = ["покупка", "работа", "отношения", "деньги", "переезд", "срок", "другое"];

export function HoraryActions({ creditCost }: { creditCost: number }) {
  const [question, setQuestion] = useState("");
  const [location, setLocation] = useState("");
  const [context, setContext] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } = useSymbolicService("horary");
  const wheel = metadataValue<NatalWheel>(result, "wheel");

  const submit = () => {
    if (question.trim().length < 12 || location.trim().length < 2 || !confirmed) {
      setMessage("Сформулируйте один точный вопрос, укажите текущее место и подтвердите формулировку.");
      return;
    }
    void generate([
      `Вопрос: ${question.trim()}`,
      `Место: ${location.trim()}`,
      focus ? `Категория: ${focus}` : "",
      context.trim() ? `Контекст: ${context.trim()}` : "",
    ].filter(Boolean).join("\n"));
  };

  if (result?.resultText) {
    return <SymbolicResultScaffold productKey="horary" eyebrow="хорарная астрология · карта момента" heading="Ответ карты на ваш вопрос" recapSummary="Зафиксированный вопрос" recapRows={[{ label: "Вопрос", value: question }, { label: "Место", value: location }, ...(focus ? [{ label: "Категория", value: focus }] : [])]} visual={wheel ? <ZodiacWheel wheel={wheel} /> : undefined} resultText={result.resultText} topic={question} creditCost={creditCost} repeat={{ ribbon: "новый вопрос", title: "Задать новый вопрос", description: "Новая формулировка фиксируется как отдельный вопрос и отдельный момент.", ctaLabel: "Начать" }} onStartNew={() => { reset(); setQuestion(""); setLocation(""); setContext(""); setFocus(null); setConfirmed(false); }} />;
  }

  return (
    <div className="soft-card product-order-surface" data-testid="horary-actions">
      <div className="product-order-head"><p className="soft-eyebrow">хорарная астрология · один вопрос, один момент</p></div>
      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Категория вопроса" label="о чём вопрос" hint="Категория помогает выбрать дом предмета вопроса; формулировка остаётся главной.">{HORARY_FOCUS.map((item) => <OptionChoice key={item} active={focus === item} disabled={status === "loading"} onClick={() => setFocus(item)}>{item}</OptionChoice>)}</OptionScrollStrip>
        <label className="soft-eyebrow product-question-label" htmlFor="horary-question">один точный вопрос</label>
        <textarea id="horary-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 500))} placeholder="Например: состоится ли покупка этой квартиры до конца месяца?" className="soft-question-input product-question-input min-h-28" disabled={status === "loading"} data-testid="horary-question" />
        <label className="soft-eyebrow product-question-label" htmlFor="horary-location">где вы находитесь сейчас</label>
        <input id="horary-location" value={location} onChange={(event) => setLocation(event.target.value.slice(0, 120))} placeholder="Москва" className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="horary-location" />
        <label className="soft-eyebrow product-question-label" htmlFor="horary-context">короткий контекст, необязательно</label>
        <textarea id="horary-context" value={context} onChange={(event) => setContext(event.target.value.slice(0, 800))} placeholder="Что уже известно, есть ли срок, задавали ли этот вопрос раньше" className="soft-question-input product-question-input min-h-20" disabled={status === "loading"} />
        <div className="rounded-2xl bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]"><p className="font-medium text-[var(--soft-ink)]">Момент будет зафиксирован на сервере при нажатии</p><p className="mt-1">После фиксации вопрос и время нельзя менять внутри этого разбора.</p></div>
        <label className="flex min-h-11 items-start gap-3 text-sm text-[var(--soft-ink-soft)]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-4" /><span>Вопрос сформулирован именно так, как я хочу его зафиксировать.</span></label>
        <div className="product-action-row">{hasEntitlement ? <Button onClick={submit} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="horary-start">{status === "loading" ? "Строим карту момента…" : "Зафиксировать вопрос"}<ArrowRight className="size-4" aria-hidden="true" /></Button> : <ProductPurchaseControls productKey="horary" label="Открыть хорарную карту" checkoutSource="horary-direct" creditCost={creditCost} onUnlocked={() => { setHasEntitlement(true); if (question.trim() && location.trim() && confirmed) submit(); }} />}</div>
      </div>
    </div>
  );
}

const TAROT_NUM_FOCUS = ["личность", "отношения", "призвание", "деньги", "сильная сторона", "тень"];

function tarotBirthCards(code: TarotBirthCode): TarotCard[] {
  return code.positions.map((position) => ({ ...position.card, position: position.label, meaning: position.card.upright, uprightMeaning: position.card.upright, reversedMeaning: position.card.reversedMeaning, reversed: false }));
}

export function TarotNumerologyActions({ creditCost }: { creditCost: number }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [question, setQuestion] = useState("");
  const [focus, setFocus] = useState<string | null>("личность");
  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } = useSymbolicService("tarot-numerology");
  const code = metadataValue<TarotBirthCode>(result, "tarotBirthCode");
  const submit = () => {
    if (name.trim().length < 2 || !/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(birth.trim())) {
      setMessage("Укажите имя и полную дату рождения в формате ДД.ММ.ГГГГ.");
      return;
    }
    void generate([`Имя: ${name.trim()}`, `Дата рождения: ${birth.trim()}`, focus ? `Фокус: ${focus}` : "", question.trim() ? `Вопрос: ${question.trim()}` : ""].filter(Boolean).join("\n"));
  };
  if (result?.resultText) {
    return <SymbolicResultScaffold productKey="tarot-numerology" eyebrow="таро · карты рождения" heading="Ваши Арканы рождения" recapSummary="Данные расчёта" recapRows={[{ label: "Имя", value: name }, { label: "Дата", value: birth }, ...(focus ? [{ label: "Фокус", value: focus }] : [])]} visual={code ? <TarotSpreadCards cards={tarotBirthCards(code)} /> : undefined} resultText={result.resultText} topic={question || focus} creditCost={creditCost} repeat={{ ribbon: "новый расчёт", title: "Рассчитать другую дату", description: "Пара карт рождения будет рассчитана по новой дате.", ctaLabel: "Начать" }} onStartNew={() => { reset(); setName(""); setBirth(""); setQuestion(""); setFocus("личность"); }} />;
  }
  return (
    <div className="soft-card product-order-surface" data-testid="tarot-numerology-actions">
      <div className="product-order-head"><p className="soft-eyebrow">арканы рождения · карты Таро по дате</p></div>
      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Фокус Арканов рождения" label="что раскрыть подробнее" hint="Фокус меняет интерпретацию, но не расчёт арканов.">{TAROT_NUM_FOCUS.map((item) => <OptionChoice key={item} active={focus === item} disabled={status === "loading"} onClick={() => setFocus(item)}>{item}</OptionChoice>)}</OptionScrollStrip>
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-name">имя</label><input id="tarot-num-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} placeholder="Алексей" className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} />
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-birth">дата рождения</label><input id="tarot-num-birth" value={birth} onChange={(event) => setBirth(event.target.value.slice(0, 10))} placeholder="03.03.1988" className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} />
        <label className="soft-eyebrow product-question-label" htmlFor="tarot-num-question">ваш вопрос, необязательно</label><textarea id="tarot-num-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 600))} placeholder="Что мои арканы показывают о смене работы сейчас?" className="soft-question-input product-question-input min-h-24" disabled={status === "loading"} />
        <div className="rounded-2xl bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">Карта рождения и карта души рассчитываются по известной системе Tarot Birth Cards. Случайных карт, мастей и перевёрнутых положений здесь нет.</div>
        <div className="product-action-row">{hasEntitlement ? <Button onClick={submit} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="tarot-numerology-start">{status === "loading" ? "Рассчитываем карты…" : "Узнать свои арканы"}<ArrowRight className="size-4" aria-hidden="true" /></Button> : <ProductPurchaseControls productKey="tarot-numerology" label="Узнать свои арканы" checkoutSource="tarot-numerology-direct" creditCost={creditCost} onUnlocked={() => { setHasEntitlement(true); if (name.trim() && birth.trim()) submit(); }} />}</div>
      </div>
    </div>
  );
}
