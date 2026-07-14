"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BadgeCheck, Camera, ChevronLeft, ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";
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
  // Таксономия правится на «Услугах» (directions-editor) — здесь read-only
  // pass-through, чтобы partial-safe PATCH /api/practitioner/profile её не затирал.
  const [categories] = useState<string[]>(initialData.categories);
  const [directions] = useState<string[]>(initialData.directions);
  const [tasks] = useState<string[]>(initialData.tags);
  const [formats] = useState<string[]>(normalizeOfferedFormats(initialData.formats));
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

  // ── ДЕСКТОП (mockup practitioner-desktop-profile-v2) ─────────────────────
  // Карточка-редактор: фото + verif-чип + публичная ссылка + личные поля
  // (Имя read-only · Специализация · О себе · Опыт · Языки). Таксономия/форматы
  // — на «Услугах» (см. «Статус и проверки» рядом), здесь только pass-through.
  return (
    <form onSubmit={handleSave} className="soft-card p-5 md:p-6" data-testid="practitioner-profile-editor-desktop">
      {/* Фото + верификация + публичная ссылка */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative shrink-0"
          aria-label="Изменить фото"
        >
          <div className="h-[68px] w-[68px] overflow-hidden rounded-full border border-[var(--soft-paper-edge)]">
            {displayAvatar ? (
              <Image src={displayAvatar} alt="Фото профиля" width={68} height={68} className="h-full w-full object-cover" />
            ) : (
              <div className="soft-avatar-fallback flex h-full w-full items-center justify-center font-heading text-2xl font-bold">
                {initial}
              </div>
            )}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--soft-paper-card)]"
            style={{ background: "var(--soft-bordeaux)", color: "var(--soft-cream,#FBF1E4)" }}
            aria-hidden="true"
          >
            <Camera size={12} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div className="min-w-0">
          {verified ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
              style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}
            >
              <BadgeCheck size={13} />
              Профиль подтверждён
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
              style={{ background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}
            >
              <ShieldAlert size={13} />
              Верификация не пройдена
            </span>
          )}
          <a
            href={publicProfileHref}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--soft-terracotta-dark)] hover:underline"
            data-testid="practitioner-profile-public"
          >
            <ExternalLink size={13} />
            Открыть публичную страницу
          </a>
        </div>
      </div>

      {/* Поля */}
      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">
            Имя <span className="text-[var(--soft-ink-faint)]">(из аккаунта, меняется в настройках)</span>
          </label>
          <Input
            value={initialData.name}
            readOnly
            aria-label="Имя"
            className="cursor-default bg-[var(--soft-paper-deep)]/40"
            data-testid="practitioner-profile-name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Специализация</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Психолог · клинический подход"
            data-testid="practitioner-profile-title"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">
            О себе <span className="text-[var(--soft-ink-faint)]">(видят клиенты в каталоге)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Расскажите о вашем пути, методах работы и чём вы помогаете…"
            className="premium-input h-32 w-full resize-none px-4 py-2 text-base outline-none focus:border-primary/50 md:text-sm"
            data-testid="practitioner-profile-bio"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Опыт</label>
          <Input
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="8 лет"
            className="max-w-xs"
            data-testid="practitioner-profile-experience"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Языки</label>
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
              <span key={lang} className="soft-chip cursor-default">{lang}</span>
            ))}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving} className="mt-6 w-full sm:w-auto">
        {saving ? "Сохранение…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}
