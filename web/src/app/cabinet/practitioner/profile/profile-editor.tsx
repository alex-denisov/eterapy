"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

const SPECIALTIES = [
  { value: "TAROT",      label: "Таро" },
  { value: "ASTROLOGY",  label: "Астрология" },
  { value: "NUMEROLOGY", label: "Нумерология" },
  { value: "PSYCHIC",    label: "Экстрасенсорика" },
  { value: "RUNES",      label: "Руны" },
  { value: "DREAMS",     label: "Сонники" },
];

interface InitialData {
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string;
  bio: string;
  experience: string;
  specialties: string[];
  tags: string[];
  languages: string[];
}

export function PractitionerProfileEditor({
  initialData,
  practitionerId,
}: {
  initialData: InitialData;
  practitionerId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(initialData.title);
  const [bio, setBio] = useState(initialData.bio);
  const [experience, setExperience] = useState(initialData.experience);
  const [specialties, setSpecialties] = useState<string[]>(initialData.specialties);
  const [tagsStr, setTagsStr] = useState(initialData.tags.join(", "));
  const [languages, setLanguages] = useState<string[]>(initialData.languages.length ? initialData.languages : ["Русский"]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Максимум 5 МБ"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function toggleSpecialty(v: string) {
    setSpecialties(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !bio) { toast.error("Заголовок и биография обязательны"); return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("bio", bio);
      formData.append("experience", experience);
      formData.append("specialties", JSON.stringify(specialties));
      formData.append("tags", JSON.stringify(tagsStr.split(",").map(t => t.trim()).filter(Boolean)));
      formData.append("languages", JSON.stringify(languages));
      if (avatarFile) formData.append("avatar", avatarFile);

      const res = await fetch("/api/practitioner/profile", { method: "PATCH", body: formData });
      const d = await res.json();
      if (d.ok) {
        toast.success("Профиль обновлён");
        setAvatarFile(null);
        if (d.avatarUrl) setAvatarPreview(d.avatarUrl);
      } else {
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка"); }
    finally { setSaving(false); }
  }

  const displayAvatar = avatarPreview ?? initialData.avatarUrl;
  const initial = initialData.name[0]?.toUpperCase() ?? "?";

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Аватар */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-5">
          <h2 className="font-semibold mb-4">Фото профиля</h2>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="relative group shrink-0">
              <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-border/40 group-hover:border-primary/50 transition-colors">
                {displayAvatar ? (
                  <Image src={displayAvatar} alt="Аватар" width={80} height={80} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-primary/20 flex items-center justify-center font-heading text-3xl font-bold text-primary">
                    {initial}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                Изменить
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div>
              <p className="text-sm font-medium">{initialData.name}</p>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="text-xs text-primary hover:underline mt-0.5">
                Загрузить фото
              </button>
              <p className="text-xs text-muted-foreground/60 mt-0.5">JPG, PNG или WebP · до 5 МБ</p>
              <p className="text-xs text-muted-foreground mt-0.5">{initialData.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Основные данные */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-5 space-y-4">
          <h2 className="font-semibold">Основная информация</h2>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Заголовок профиля</label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Таролог · Астролог · 7 лет практики"
              className="bg-card/50" />
            <p className="text-xs text-muted-foreground/60 mt-1">
              Отображается в каталоге. Коротко и ёмко.
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Биография</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Расскажите о вашем пути, методах работы и чём вы помогаете..."
              className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-sm resize-none h-32 focus:outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Опыт работы</label>
            <Input value={experience} onChange={e => setExperience(e.target.value)}
              placeholder="5 лет" className="bg-card/50 max-w-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Специализации */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-5">
          <h2 className="font-semibold mb-3">Специализации</h2>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map(s => (
              <button key={s.value} type="button" onClick={() => toggleSpecialty(s.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  specialties.includes(s.value)
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:border-border/60"
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Теги */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-5">
          <h2 className="font-semibold mb-3">Теги</h2>
          <Input value={tagsStr} onChange={e => setTagsStr(e.target.value)}
            placeholder="отношения, карьера, самопознание, нумерология имени"
            className="bg-card/50" />
          <p className="text-xs text-muted-foreground/60 mt-1">
            Через запятую. Помогают клиентам найти вас по запросу.
          </p>
        </CardContent>
      </Card>

      {/* Ссылка на публичный профиль */}
      <div className="flex items-center gap-3 rounded-xl border border-border/20 bg-card/20 px-4 py-3">
        <span className="text-2xl">🔗</span>
        <div className="flex-1">
          <p className="text-sm font-medium">Публичный профиль</p>
          <p className="text-xs text-muted-foreground">Клиенты видят ваш профиль по этой ссылке</p>
        </div>
        <a href={`/practitioners/${practitionerId}`} target="_blank"
          className="text-xs text-primary hover:underline">
          Открыть ↗
        </a>
      </div>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? "Сохранение..." : "Сохранить профиль"}
      </Button>
    </form>
  );
}
