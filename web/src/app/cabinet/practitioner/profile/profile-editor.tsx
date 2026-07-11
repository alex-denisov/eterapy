"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BadgeCheck, Camera, ChevronLeft, ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { PractitionerTaxonomyFields } from "@/components/practitioner/taxonomy-fields";
import { SessionFormatsField } from "@/components/practitioner/session-formats-field";
import { specialtiesForDirections } from "@/lib/practitioner-taxonomy";
import { normalizeOfferedFormats } from "@/lib/session-formats";

interface InitialData {
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string;
  bio: string;
  experience: string;
  categories: string[];
  directions: string[];
  specialties: string[];
  tags: string[];
  formats: string[];
  languages: string[];
}

export function PractitionerProfileEditor({
  initialData,
  practitionerId,
  variant = "desktop",
  verified = false,
  backHref = "/cabinet/practitioner/more",
  publicHref,
  verificationHref = "/cabinet/practitioner/verification",
}: {
  initialData: InitialData;
  practitionerId: string;
  variant?: "desktop" | "pcab";
  verified?: boolean;
  backHref?: string;
  publicHref?: string;
  verificationHref?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(initialData.title);
  const [bio, setBio] = useState(initialData.bio);
  const [experience, setExperience] = useState(initialData.experience);
  const [categories, setCategories] = useState<string[]>(initialData.categories);
  const [directions, setDirections] = useState<string[]>(initialData.directions);
  const [tasks, setTasks] = useState<string[]>(initialData.tags);
  const [formats, setFormats] = useState<string[]>(normalizeOfferedFormats(initialData.formats));
  const [languages] = useState<string[]>(initialData.languages.length ? initialData.languages : ["Русский"]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Максимум 5 МБ"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
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
      formData.append("categories", JSON.stringify(categories));
      formData.append("directions", JSON.stringify(directions));
      // esoteric directions stay mirrored onto the Specialty enum for legacy surfaces
      formData.append("specialties", JSON.stringify(specialtiesForDirections(directions)));
      formData.append("tags", JSON.stringify(tasks));
      formData.append("formats", JSON.stringify(formats));
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
  const publicProfileHref = publicHref ?? `/cabinet/practitioners/${practitionerId}`;

  // ── МОБАЙЛ (mockup practitioner-more-profile) ────────────────────────────
  // Тот же shared-стейт и handleSave, что и десктоп; сохранение шлёт ВСЕ поля
  // (title/bio/experience редактируются здесь, categories/directions/formats/
  // tags/languages уходят неизменными из initialData → PATCH partial-safe не
  // затирает таксономию, которую правят на «Услуги»). Имя — read-only (задаётся
  // в аккаунте, редактор его не меняет, как и десктоп).
  if (variant === "pcab") {
    return (
      <form onSubmit={handleSave} className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-profile-mobile">
        <div className="pcab-topbar">
          <Link href={backHref} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Профиль</span>
          <button type="submit" className="pcab-save-link" disabled={saving} data-testid="practitioner-profile-save-mobile">
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>

        <div className="pcab-pf-photorow">
          <button type="button" className="pcab-pf-photo" onClick={() => fileRef.current?.click()} aria-label="Изменить фото">
            {displayAvatar ? (
              <Image src={displayAvatar} alt="Фото профиля" width={66} height={66} className="pcab-pf-photo-img" />
            ) : (
              <span>{initial}</span>
            )}
            <span className="pcab-pf-cam" aria-hidden="true"><Camera size={13} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <div className="pcab-pf-info">
            {verified ? (
              <span className="pcab-pf-verif">
                <BadgeCheck size={13} aria-hidden="true" />
                Личность и диплом подтверждены
              </span>
            ) : (
              <span className="pcab-pf-verif pcab-pf-verif-off">
                <ShieldAlert size={13} aria-hidden="true" />
                Верификация не пройдена
              </span>
            )}
            <a href={publicProfileHref} target="_blank" rel="noreferrer" className="pcab-pf-pub" data-testid="practitioner-profile-public-mobile">
              <ExternalLink size={13} aria-hidden="true" />
              Открыть публичную страницу
            </a>
          </div>
        </div>

        <div className="pcab-flabel">Имя</div>
        <label className="pcab-fieldinput" style={{ cursor: "default" }}>
          <input value={initialData.name} readOnly aria-label="Имя" data-testid="practitioner-profile-name-mobile" />
        </label>

        <div className="pcab-flabel">Специализация</div>
        <label className="pcab-fieldinput" style={{ cursor: "text" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Психолог · клинический подход"
            aria-label="Специализация"
            data-testid="practitioner-profile-title-mobile"
          />
        </label>

        <div className="pcab-flabel">
          О себе <span className="opt">(видят клиенты)</span>
        </div>
        <textarea
          className="pcab-pf-ta"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Расскажите о вашем пути, методах работы и чём вы помогаете…"
          aria-label="О себе"
          data-testid="practitioner-profile-bio-mobile"
        />

        <div className="pcab-pf-row2">
          <div>
            <div className="pcab-flabel">Языки</div>
            <div className="pcab-chips" style={{ marginTop: 0 }}>
              {languages.map((lang) => (
                <span key={lang} className="pcab-chip" style={{ cursor: "default" }}>{lang}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="pcab-flabel">Опыт</div>
            <label className="pcab-fieldinput" style={{ cursor: "text" }}>
              <input
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="8 лет"
                aria-label="Опыт"
                data-testid="practitioner-profile-experience-mobile"
              />
            </label>
          </div>
        </div>

        <Link href={verificationHref} className="pcab-list pcab-pf-navrow" data-testid="practitioner-profile-verification-mobile">
          <span className="pcab-row">
            <span className={`pcab-row-ic ${verified ? "sage" : "amber"}`}>
              {verified ? <BadgeCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />}
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Верификация</span>
              <span className="pcab-row-s">{verified ? "Личность и диплом · подтверждены" : "Не пройдена · подтвердите"}</span>
            </span>
            <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
          </span>
        </Link>
      </form>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Аватар */}
      <div className="soft-card">
        <div className="p-5">
          <h2 className="font-semibold mb-4">Фото профиля</h2>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="relative group shrink-0">
              <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-border/40 group-hover:border-primary/50 transition-colors">
                {displayAvatar ? (
                  <Image src={displayAvatar} alt="Аватар" width={80} height={80} className="h-full w-full object-cover" />
                ) : (
                  <div className="soft-avatar-fallback h-full w-full flex items-center justify-center font-heading text-3xl font-bold">
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
              <p className="text-xs text-[var(--soft-ink-soft)]/60 mt-0.5">JPG, PNG или WebP · до 5 МБ</p>
              <p className="text-xs text-[var(--soft-ink-soft)] mt-0.5">{initialData.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Основные данные */}
      <div className="soft-card">
        <div className="p-5 space-y-4">
          <h2 className="font-semibold">Основная информация</h2>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Заголовок профиля</label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Таролог · Астролог · 7 лет практики"
              className="bg-[rgba(255,255,255,0.035)]" />
            <p className="text-xs text-[var(--soft-ink-soft)]/60 mt-1">
              Отображается в каталоге. Коротко и ёмко.
            </p>
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Биография</label>
            {/* B344 / Интерфейс 15: align the bio textarea to the same field
                family as «Заголовок» / «Опыт» (premium-input, px-4, text-base
                md:text-sm) so the three fields share one look instead of the
                textarea standing apart with a smaller font + different border. */}
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Расскажите о вашем пути, методах работы и чём вы помогаете..."
              className="premium-input w-full px-4 py-2 text-base md:text-sm bg-[rgba(255,255,255,0.035)] resize-none h-32 outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-sm text-[var(--soft-ink-soft)] mb-1.5 block">Опыт работы</label>
            <Input value={experience} onChange={e => setExperience(e.target.value)}
              placeholder="5 лет" className="bg-[rgba(255,255,255,0.035)] max-w-xs" />
          </div>
        </div>
      </div>

      {/* Таксономия: специализация → направление → задачи (W3) */}
      <div className="soft-card">
        <div className="p-5">
          <h2 className="font-semibold mb-3">Специализация и задачи</h2>
          <PractitionerTaxonomyFields
            value={{ categories, directions, tasks }}
            onChange={(next) => {
              setCategories(next.categories);
              setDirections(next.directions);
              setTasks(next.tasks);
            }}
          />
          <div className="mt-5 border-t border-border/30 pt-5">
            <SessionFormatsField value={formats} onChange={setFormats} />
          </div>
        </div>
      </div>

      {/* Ссылка на публичный профиль */}
      <div className="soft-map-tile flex items-center gap-3 px-4 py-3">
        <span className="text-2xl">🔗</span>
        <div className="flex-1">
          <p className="text-sm font-medium">Публичный профиль</p>
          <p className="text-xs text-[var(--soft-ink-soft)]">Клиенты видят ваш профиль по этой ссылке</p>
        </div>
        <a href={`/cabinet/practitioners/${practitionerId}`} target="_blank"
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
