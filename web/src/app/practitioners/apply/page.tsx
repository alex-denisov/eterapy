"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SPECIALTY_LABELS, type Specialty } from "@/data/practitioners";

const SPECIALTIES = Object.keys(SPECIALTY_LABELS) as Specialty[];

const STEPS = ["Специализация", "О вас", "Контакты", "Готово"];

export default function ApplyPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Step 0
  const [selectedSpecialties, setSelectedSpecialties] = useState<Specialty[]>([]);
  const [experience, setExperience] = useState("");

  // Step 1
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [price, setPrice] = useState("");
  const [languages, setLanguages] = useState("Русский");

  // Step 2
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");

  function toggleSpecialty(s: Specialty) {
    setSelectedSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleSubmit() {
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-5xl">✦</div>
        <h1 className="mt-6 font-heading text-2xl font-bold">Заявка отправлена</h1>
        <p className="mt-3 text-muted-foreground">
          Мы рассмотрим вашу заявку в течение 3–5 рабочих дней и свяжемся с вами
          по email или Telegram.
        </p>
        <div className="mt-8 rounded-xl border border-primary/20 bg-card/30 p-6 text-left space-y-2">
          <p className="text-sm font-medium">Что будет дальше:</p>
          {[
            "Проверка личности (KYC) — потребуется документ",
            "Тест-консультация с модератором ETerapy",
            "Активация профиля и значка «Проверен ETerapy»",
          ].map((item, i) => (
            <p key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-primary font-bold">{i + 1}.</span> {item}
            </p>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-block text-sm text-primary hover:underline">
          ← На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Хлебные крошки */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Главная</Link>
        {" / "}
        <span>Стать практиком</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold">Стать практиком ETerapy</h1>
      <p className="mt-2 text-muted-foreground">
        Первые 50 практиков — комиссия 15% на 6 месяцев вместо 25%.
      </p>

      {/* Преимущества */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: "💰", text: "25% комиссия\n(15% первые 6 мес)" },
          { icon: "🌍", text: "Stripe для\nмеждународных" },
          { icon: "📋", text: "Легальные\nвыплаты" },
          { icon: "✦", text: "Значок\nверификации" },
        ].map((item) => (
          <div key={item.text} className="rounded-xl border border-border/40 bg-card/30 p-3 text-center">
            <span className="text-2xl">{item.icon}</span>
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>

      {/* Прогресс */}
      <div className="mt-10 flex items-center gap-2">
        {STEPS.slice(0, -1).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i < step ? "bg-primary text-navy" : i === step ? "border-2 border-primary text-primary" : "border border-border/40 text-muted-foreground"
            }`}>
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
            {i < STEPS.length - 2 && <span className="text-border/40">—</span>}
          </div>
        ))}
      </div>

      <Card className="mt-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          {/* Шаг 0: Специализация */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className="mb-3 block font-medium">Ваша специализация *</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                        selectedSpecialties.includes(s)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/40 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {SPECIALTY_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Опыт практики *</label>
                <div className="flex flex-wrap gap-2">
                  {["До 1 года", "1–3 года", "3–5 лет", "5–10 лет", "Более 10 лет"].map((v) => (
                    <button key={v} onClick={() => setExperience(v)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        experience === v ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-primary/40"
                      }`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => setStep(1)}
                disabled={selectedSpecialties.length === 0 || !experience}
                className="w-full"
              >
                Далее →
              </Button>
            </div>
          )}

          {/* Шаг 1: О вас */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Ваше имя (будет отображаться клиентам) *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Елена Морозова" className="bg-background/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">О себе и своей практике *</label>
                <textarea
                  value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="Расскажите о своём подходе, специализации, опыте. Это ваш публичный текст."
                  className="w-full resize-none rounded-lg border border-border/40 bg-background/50 p-3 text-sm focus:border-primary focus:outline-none"
                  rows={5} maxLength={800}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/800</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Цена за сессию (₽) *</label>
                  <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                    placeholder="2000" min={500} max={20000} className="bg-background/50" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Языки консультаций</label>
                  <Input value={languages} onChange={(e) => setLanguages(e.target.value)}
                    placeholder="Русский, English" className="bg-background/50" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)} className="border-border/40">← Назад</Button>
                <Button onClick={() => setStep(2)} disabled={!name.trim() || bio.length < 50 || !price} className="flex-1">
                  Далее →
                </Button>
              </div>
            </div>
          )}

          {/* Шаг 2: Контакты */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Email для связи *</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" className="bg-background/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Telegram (необязательно)</label>
                <Input value={telegram} onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username" className="bg-background/50" />
              </div>
              <div className="rounded-xl border border-border/30 bg-card/20 p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Итого заявка:</p>
                <p>Специализация: {selectedSpecialties.map(s => SPECIALTY_LABELS[s]).join(", ")}</p>
                <p>Опыт: {experience}</p>
                <p>Имя: {name}</p>
                <p>Цена: {price} ₽/сессия</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Отправляя заявку, вы соглашаетесь с{" "}
                <Link href="/legal/ethics" className="text-primary hover:underline">Этическим кодексом</Link>{" "}
                и{" "}
                <Link href="/legal/offer" className="text-primary hover:underline">Офертой</Link>.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="border-border/40">← Назад</Button>
                <Button onClick={handleSubmit} disabled={!email.trim()} className="flex-1">
                  Отправить заявку
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
