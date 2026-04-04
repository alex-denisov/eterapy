"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

const SPECIALTIES = [
  { value: "TAROT",     label: "Таро" },
  { value: "ASTROLOGY", label: "Астрология" },
  { value: "NUMEROLOGY",label: "Нумерология" },
  { value: "PSYCHIC",   label: "Экстрасенсорика" },
  { value: "RUNES",     label: "Руны" },
  { value: "DREAMS",    label: "Сонники" },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

interface CreatedPractitioner {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: null;
  userBlockedAt: null;
  status: string;
  title: string;
  bio: string;
  experience: string;
  specialties: string[];
  tags: string[];
  pricePerSession: number;
  sessionDuration: number;
  verified: boolean;
  founding: boolean;
  reviewCount: number;
  sessionCount: number;
  minRate: number | null;
  minRateDuration: number | null;
  createdAt: string;
}

export function CreatePractitionerForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: CreatedPractitioner) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [creating, setCreating] = useState(false);

  // Шаг 1 — аккаунт
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Шаг 2 — профиль практика
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("1 год");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [verified, setVerified] = useState(false);
  const [founding, setFounding] = useState(false);

  // Тарифы
  const [rates, setRates] = useState<Record<number, { enabled: boolean; price: string }>>({
    15:  { enabled: false, price: "500" },
    30:  { enabled: false, price: "900" },
    45:  { enabled: false, price: "1200" },
    60:  { enabled: true,  price: "1500" },
    90:  { enabled: false, price: "2000" },
    120: { enabled: false, price: "2500" },
  });

  function toggleSpecialty(v: string) {
    setSpecialties(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v]);
  }

  async function handleCreate() {
    if (!name || !email || !password) { toast.error("Заполните имя, email и пароль"); return; }
    if (!title || !bio || specialties.length === 0) { toast.error("Заполните профиль практика"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/practitioners/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, password,
          title, bio, experience,
          specialties,
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          verified, founding,
          rates: DURATIONS.map(d => ({
            durationMin: d,
            priceRub: parseInt(rates[d].price) || 0,
            enabled: rates[d].enabled,
          })),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("Практик создан");
        onCreated(d.practitioner);
      } else {
        toast.error(d.error ?? "Ошибка создания");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Создать аккаунт практика</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
      </div>

      {/* Шаги */}
      <div className="flex gap-2 mb-2">
        {([1, 2] as const).map(s => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              step === s ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}>
            <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${
              step === s ? "bg-primary text-navy" : "bg-border/40"
            }`}>{s}</span>
            {s === 1 ? "Аккаунт" : "Профиль и тарифы"}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Аккаунт пользователя с ролью PRACTITIONER</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
              <Input placeholder="Мария Иванова" value={name} onChange={e => setName(e.target.value)} className="bg-card/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input type="email" placeholder="practitioner@example.com" value={email} onChange={e => setEmail(e.target.value)} className="bg-card/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Пароль (мин. 8 символов)</label>
              <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="bg-card/50" />
            </div>
          </div>
          <button onClick={() => {
            if (!name || !email || password.length < 8) { toast.error("Заполните все поля (пароль мин. 8 символов)"); return; }
            setStep(2);
          }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy">
            Далее →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {/* Профиль */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Заголовок профиля</label>
              <Input placeholder="Таролог · Астролог · 7 лет практики" value={title} onChange={e => setTitle(e.target.value)} className="bg-card/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Биография</label>
              <textarea placeholder="Расскажите о практике..." value={bio} onChange={e => setBio(e.target.value)}
                className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Опыт</label>
              <Input placeholder="5 лет" value={experience} onChange={e => setExperience(e.target.value)} className="bg-card/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Теги (через запятую)</label>
              <Input placeholder="астрология, отношения, карьера" value={tags} onChange={e => setTags(e.target.value)} className="bg-card/50" />
            </div>
          </div>

          {/* Специализации */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Специализации</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map(s => (
                <button key={s.value} onClick={() => toggleSpecialty(s.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    specialties.includes(s.value)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Флаги */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="accent-primary" />
              <span className="text-sm">✓ Верифицирован</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={founding} onChange={e => setFounding(e.target.checked)} className="accent-primary" />
              <span className="text-sm">⭐ Основатель</span>
            </label>
          </div>

          {/* Тарифы */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тарифная сетка</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {DURATIONS.map(dur => (
                <div key={dur} className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                  rates[dur].enabled ? "border-primary/30 bg-primary/5" : "border-border/20"
                }`}>
                  <input type="checkbox" checked={rates[dur].enabled}
                    onChange={e => setRates(prev => ({ ...prev, [dur]: { ...prev[dur], enabled: e.target.checked } }))}
                    className="accent-primary shrink-0" />
                  <span className="text-xs w-10 shrink-0">{dur} мин</span>
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number" min="0"
                      value={rates[dur].price}
                      onChange={e => setRates(prev => ({ ...prev, [dur]: { ...prev[dur], price: e.target.value } }))}
                      disabled={!rates[dur].enabled}
                      className="h-6 text-xs bg-card/50 px-2"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">₽</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)}
              className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              ← Назад
            </button>
            <button onClick={handleCreate} disabled={creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
              {creating ? "Создание..." : "Создать практика"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
