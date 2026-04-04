import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  try {
    const { practitionerId, practitionerName, slot, clientName, clientEmail } = await req.json();

    if (!practitionerId || !slot) {
      return NextResponse.json({ error: "Данные запроса неполны" }, { status: 400 });
    }

    // TODO: В будущем записываем в БД и берём email практика из БД
    // Сейчас отправляем на admin email как уведомление
    const adminEmail = "hello@eterapy.com";

    try {
      await resend.emails.send({
        from: "ETerapy <noreply@eterapy.com>",
        to: adminEmail,
        subject: `Новый запрос на сессию — ${practitionerName}`,
        html: `
<div style="font-family:Inter,sans-serif;color:#1e293b;padding:24px">
  <h2 style="color:#C9A84C">Новый запрос на запись</h2>
  <p><strong>Практик:</strong> ${practitionerName}</p>
  <p><strong>Слот:</strong> ${slot}</p>
  <p><strong>Клиент:</strong> ${clientName} (${clientEmail})</p>
  <p><a href="${APP_URL}/practitioners/${practitionerId}" style="color:#C9A84C">Профиль практика →</a></p>
  <hr style="border-color:#e2e8f0;margin:16px 0">
  <p style="color:#64748b;font-size:12px">ETerapy · ${new Date().toLocaleString("ru-RU")}</p>
</div>`,
      });
    } catch (emailErr) {
      console.error("[booking] notification email failed:", emailErr);
      // Не блокируем — бронирование состоялось
    }

    // TODO: отправить подтверждение клиенту
    try {
      await resend.emails.send({
        from: "ETerapy <noreply@eterapy.com>",
        to: clientEmail,
        subject: `Запрос на сессию отправлен — ${practitionerName}`,
        html: `
<div style="font-family:Inter,sans-serif;background:#0D1B2A;color:#e2e8f0;padding:40px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);padding:40px">
        <tr><td>
          <p style="color:#C9A84C;font-size:22px;font-weight:700;margin:0 0 24px">ETerapy</p>
          <h1 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 16px">Запрос отправлен!</h1>
          <p style="color:#94a3b8;line-height:1.6;margin:0 0 16px">
            Привет, ${clientName}! Ваш запрос на сессию с <strong style="color:#f8fafc">${practitionerName}</strong> 
            на слот <strong style="color:#f8fafc">${slot}</strong> отправлен.
          </p>
          <p style="color:#94a3b8;line-height:1.6;margin:0 0 24px">
            Практик свяжется с вами для подтверждения. Стоимость будет списана только после завершения сессии.
          </p>
          <a href="${APP_URL}/practitioners/${practitionerId}" 
             style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Профиль практика
          </a>
          <p style="color:#475569;font-size:12px;margin-top:32px">
            ETerapy · Все услуги носят развлекательный и ознакомительный характер
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`,
      });
    } catch (emailErr) {
      console.error("[booking] confirmation email failed:", emailErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[booking/request]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
