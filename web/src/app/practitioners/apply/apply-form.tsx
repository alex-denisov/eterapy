"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sanitizeName,
  sanitizeEmail,
  sanitizeUsername,
  sanitizeText,
  getNameError,
  getEmailError,
  getTelegramError,
} from "@/lib/validation";

const SPECIALTIES = [
  { value: "PSYCHOLOGIST", label: "Психология" },
  { value: "COACH",        label: "Коучинг" },
  { value: "LEGAL",        label: "Юридические консультации" },
  { value: "FINANCE",      label: "Финансовый коучинг" },
  { value: "TAROT",      label: "Таро" },
  { value: "ASTROLOGY",  label: "Астрология" },
  { value: "NUMEROLOGY", label: "Нумерология" },
];

const EXPERIENCE_OPTIONS = [
  "Менее 1 года",
  "1–3 года",
  "3–5 лет",
  "5–10 лет",
  "Более 10 лет",
];

const SESSION_FORMATS = [
  "Индивидуальные консультации",
  "Парные сессии",
  "Пакеты встреч",
  "Групповые программы",
  "Расклады таро",
  "Натальные карты",
  "Нумерологический анализ",
  "Символические расклады",
];

export function ApplyForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Шаг 1 — Контакты
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  // Шаг 2 — Практика
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [formats, setFormats] = useState<string[]>([]);

  // Шаг 3 — О себе
  const [about, setAbout] = useState("");
  const [aboutError, setAboutError] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [portfolio, setPortfolio] = useState("");

  function toggleSpecialty(v: string) {
    setSpecialties(p => p.includes(v) ? p.filter(s => s !== v) : [...p, v]);
  }
  function toggleFormat(v: string) {
    setFormats(p => p.includes(v) ? p.filter(s => s !== v) : [...p, v]);
  }

  function validateStep1() {
    const nameErr = getNameError(name);
    setNameError(nameErr);
    if (nameErr) { toast.error(nameErr); return false; }

    const emailErr = getEmailError(email);
    setEmailError(emailErr);
    if (emailErr) { toast.error(emailErr); return false; }

    if (telegram.trim()) {
      const tgErr = getTelegramError(telegram);
      setTelegramError(tgErr);
      if (tgErr) { toast.error(tgErr); return false; }
    }
    return true;
  }
  function validateStep2() {
    if (specialties.length === 0) { toast.error("Выберите хотя бы одну специализацию"); return false; }
    if (!experience) { toast.error("Укажите опыт работы"); return false; }
    return true;
  }
  function validateStep3() {
    if (about.trim().length < 50) {
      setAboutError("Расскажите о себе подробнее (минимум 50 символов)");
      toast.error("Расскажите о себе подробнее (минимум 50 символов)");
      return false;
    }
    if (about.length > 500) {
      setAboutError("Текст слишком длинный (макс. 500 символов)");
      toast.error("Текст слишком длинный (макс. 500 символов)");
      return false;
    }
    if (why.length > 100) {
      toast.error("Текст слишком длинный (макс. 100 символов)");
      return false;
    }
    if (portfolio.length > 500) {
      toast.error("Ссылки слишком длинные (макс. 500 символов)");
      return false;
    }
    setAboutError(null);
    return true;
  }

  async function handleSubmit() {
    if (!validateStep3()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/practitioners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, telegram, specialties, experience, formats, about, why, portfolio }),
      });
      const d = await res.json();
      if (d.ok) {
        setSubmitted(true);
      } else {
        toast.error(d.error ?? "Ошибка отправки");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <div className="soft-card-flat p-10 text-center">
        <CheckCircle2 className="mx-auto mb-4 size-10 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h3 className="font-heading text-2xl font-bold text-[var(--soft-bordeaux)] mb-3">Заявка отправлена</h3>
        <p className="text-[var(--soft-ink-soft)] max-w-md mx-auto">
          Мы получили вашу заявку и свяжемся с <strong className="text-[var(--soft-bordeaux)]">{email}</strong> в течение 1–2 рабочих дней.
          {telegram && " Также можем написать вам в Telegram."}
        </p>
      </div>
    );
  }

  const STEP_LABELS = ["Контакты", "Специализация", "О себе"];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Прогресс */}
      <div className="mb-8 flex gap-2 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-3">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className={`flex items-center gap-2 flex-1 ${i > 0 ? "pl-2" : ""}`}>
              {i > 0 && <div className={`h-px flex-1 ${done ? "bg-[var(--soft-terracotta-dark)]" : "bg-[var(--soft-paper-edge)]"}`} />}
              <div className="flex items-center gap-2 shrink-0">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done ? "bg-[var(--soft-terracotta-dark)] text-[#fbf0e1]" :
                  active ? "border border-[var(--soft-terracotta-dark)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]" :
                  "bg-[var(--soft-paper-card)] text-[var(--soft-ink-faint)]"
                }`}>
                  {done ? <Check className="size-3.5" aria-hidden="true" /> : n}
                </div>
                <span className={`text-sm hidden sm:block ${active ? "text-[var(--soft-bordeaux)] font-medium" : "text-[var(--soft-ink-faint)]"}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Шаг 1 */}
      {step === 1 && (
        <div className="soft-card-flat p-6 space-y-4">
          <h3 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Контактные данные</h3>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Имя *</label>
            <Input value={name} onChange={e => { setName(sanitizeName(e.target.value)); setNameError(null); }}
              placeholder="Мария Иванова" className={`soft-input ${nameError ? "border-destructive" : ""}`} />
            {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Email *</label>
            <Input type="email" value={email} onChange={e => { setEmail(sanitizeEmail(e.target.value)); setEmailError(null); }}
              placeholder="your@email.com" className={`soft-input ${emailError ? "border-destructive" : ""}`} />
            {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
            <p className="text-xs text-[var(--soft-ink-faint)] mt-1">На этот email придёт ответ по заявке</p>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Telegram (необязательно)</label>
            <Input value={telegram} onChange={e => { setTelegram(sanitizeUsername(e.target.value)); setTelegramError(null); }}
              placeholder="username" className={`soft-input ${telegramError ? "border-destructive" : ""}`} />
            {telegramError && <p className="text-xs text-destructive mt-1">{telegramError}</p>}
          </div>
          <Button className="soft-button soft-button-primary w-full" onClick={() => validateStep1() && setStep(2)}>
            Далее
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Шаг 2 */}
      {step === 2 && (
        <div className="soft-card-flat p-6 space-y-5">
          <h3 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Ваша специализация</h3>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-2 block">Специализации *</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map(s => (
                <button key={s.value} type="button" onClick={() => toggleSpecialty(s.value)}
                  className={`soft-chip ${
                    specialties.includes(s.value)
                      ? "soft-chip-warm"
                      : ""
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-2 block">Опыт работы *</label>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_OPTIONS.map(opt => (
                <button key={opt} type="button" onClick={() => setExperience(opt)}
                  className={`soft-chip ${
                    experience === opt
                      ? "soft-chip-warm"
                      : ""
                  }`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-2 block">Форматы работы (необязательно)</label>
            <div className="flex flex-wrap gap-2">
              {SESSION_FORMATS.map(f => (
                <button key={f} type="button" onClick={() => toggleFormat(f)}
                  className={`soft-chip ${
                    formats.includes(f)
                      ? "soft-chip-warm"
                      : ""
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="soft-button soft-button-ghost flex-1" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Назад
            </Button>
            <Button className="soft-button soft-button-primary flex-1" onClick={() => validateStep2() && setStep(3)}>
              Далее
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Шаг 3 */}
      {step === 3 && (
        <div className="soft-card-flat p-6 space-y-5">
          <h3 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Расскажите о себе</h3>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">О себе и своём подходе *</label>
            <textarea value={about} onChange={e => { setAbout(sanitizeText(e.target.value, 500)); setAboutError(null); }}
              placeholder="Расскажите о вашей практике, методах работы, образовании или пути в эзотерике. Что отличает вас от других? Как проходят ваши сессии?"
              className={`soft-input h-36 w-full resize-none px-3 py-2.5 text-sm ${aboutError ? "border-destructive" : ""}`} />
            <p className={`text-xs mt-1 ${aboutError ? "text-destructive" : "text-[var(--soft-ink-faint)]"}`}>
              {about.length} / 500 символов (мин. 50)
              {aboutError && ` — ${aboutError}`}
            </p>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Почему ETerapy? (необязательно)</label>
            <textarea value={why} onChange={e => setWhy(sanitizeText(e.target.value, 100))}
              placeholder="Что привлекает вас именно в нашей платформе?"
              className="soft-input h-20 w-full resize-none px-3 py-2.5 text-sm" />
            <p className="text-xs text-[var(--soft-ink-faint)] mt-1">{why.length} / 100 символов</p>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Ссылки / портфолио (необязательно)</label>
            <Input value={portfolio} onChange={e => setPortfolio(sanitizeText(e.target.value, 500))}
              placeholder="Сайт, Instagram, VK, отзывы клиентов..." className="soft-input" />
            <p className="text-xs text-[var(--soft-ink-faint)] mt-1">{portfolio.length} / 500 символов</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="soft-button soft-button-ghost flex-1" onClick={() => setStep(2)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Назад
            </Button>
            <Button className="soft-button soft-button-primary flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Отправляем..." : "Отправить заявку"}
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
