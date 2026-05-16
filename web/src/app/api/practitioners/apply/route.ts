/**
 * POST /api/practitioners/apply — отправка заявки на роль практика
 *
 * Сохраняет заявку в БД + уведомляет суперадмина по email.
 * Модель: PractitionerApplication (в схеме)
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Resend } from "resend";
import { validateName, validateEmail, validateTelegramUsername } from "@/lib/validation";
import { log } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? "admin@eterapy.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, telegram, specialties, experience, formats, about, why, portfolio } = body;

  // Required fields
  if (!name?.trim() || !email?.trim() || !about?.trim()) {
    return NextResponse.json({ error: "Заполните обязательные поля" }, { status: 400 });
  }

  // Name validation
  if (!validateName(name.trim())) {
    return NextResponse.json({ error: "Имя может содержать только буквы, пробелы и дефисы (макс. 50 символов)" }, { status: 400 });
  }

  // Email validation
  if (!validateEmail(email.trim())) {
    return NextResponse.json({ error: "Введите корректный email (без символа '+', макс. 50 символов)" }, { status: 400 });
  }

  // Telegram username validation (optional but if provided, must be valid)
  if (telegram?.trim() && !validateTelegramUsername(telegram.trim())) {
    return NextResponse.json({ error: "Telegram может содержать только латинские буквы, цифры и подчёркивание (макс. 50 символов)" }, { status: 400 });
  }

  // Text length validation
  if (about.trim().length < 50 || about.trim().length > 500) {
    return NextResponse.json({ error: "Расскажите о себе (от 50 до 500 символов)" }, { status: 400 });
  }
  if (why && why.length > 100) {
    return NextResponse.json({ error: "Текст слишком длинный (макс. 100 символов)" }, { status: 400 });
  }
  if (portfolio && portfolio.length > 500) {
    return NextResponse.json({ error: "Ссылки слишком длинные (макс. 500 символов)" }, { status: 400 });
  }

  if (specialties?.length === 0) {
    return NextResponse.json({ error: "Выберите специализацию" }, { status: 400 });
  }

  // Сохраняем заявку
  const application = await db.practitionerApplication.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      telegram: telegram?.trim() || null,
      specialties: specialties ?? [],
      experience: experience ?? "",
      formats: formats ?? [],
      about: about.trim(),
      why: why?.trim() || null,
      portfolio: portfolio?.trim() || null,
    },
  });

  // Уведомляем суперадмина
  if (process.env.RESEND_API_KEY) {
    await resend.emails.send({
      from: "ETerapy <noreply@eterapy.com>",
      to: ADMIN_EMAIL,
      subject: `Новая заявка практика: ${name}`,
      html: `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0D1B2A;font-family:Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);padding:40px;max-width:560px">
<tr><td>
  <p style="margin:0 0 20px;color:#C9A84C;font-size:18px;font-weight:700">✦ ETerapy — Новая заявка</p>
  <h2 style="margin:0 0 20px;color:#f8fafc;font-size:20px">Заявка от ${name}</h2>

  <table style="width:100%;margin:0 0 20px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;width:130px">Email:</td><td style="color:#f8fafc">${email}</td></tr>
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Telegram:</td><td style="color:#f8fafc">${telegram || "—"}</td></tr>
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Специализации:</td><td style="color:#f8fafc">${specialties?.join(", ") || "—"}</td></tr>
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Опыт:</td><td style="color:#f8fafc">${experience || "—"}</td></tr>
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Портфолио:</td><td style="color:#f8fafc">${portfolio || "—"}</td></tr>
  </table>

  <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">О себе:</p>
  <p style="margin:0 0 20px;color:#f8fafc;line-height:1.6;background:rgba(255,255,255,0.05);padding:16px;border-radius:8px">${about.replace(/\n/g, "<br>")}</p>

  ${why ? `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Почему ETerapy:</p>
  <p style="margin:0 0 20px;color:#f8fafc;line-height:1.6">${why.replace(/\n/g, "<br>")}</p>` : ""}

  <a href="${APP_URL}/admin/practitioners" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
    Открыть панель практиков →
  </a>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0">
  <p style="color:#475569;font-size:11px">ID заявки: ${application.id}</p>
</td></tr>
</table></td></tr></table>
</body></html>`,
    }).catch((e) => log.error("practitioners.apply.email_failed", { err: e }));
  }

  return NextResponse.json({ ok: true, id: application.id });
}
