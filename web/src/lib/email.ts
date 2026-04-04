import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "ETerapy <noreply@eterapy.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/verify-email?token=${token}`;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Подтвердите email — ETerapy",
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A;font-family:Inter,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);padding:40px">
        <tr><td>
          <p style="margin:0 0 8px;color:#C9A84C;font-size:22px;font-weight:700">ETerapy</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#f8fafc">Подтвердите ваш email</h1>
          <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${name}!</p>
          <p style="margin:0 0 32px;color:#94a3b8;line-height:1.6">
            Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.
          </p>
          <a href="${url}" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
            Подтвердить email
          </a>
          <p style="margin:32px 0 0;color:#475569;font-size:12px;line-height:1.6">
            Если вы не регистрировались на ETerapy — просто проигнорируйте это письмо.<br>
            Или скопируйте ссылку: <a href="${url}" style="color:#C9A84C">${url}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Сброс пароля — ETerapy",
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A;font-family:Inter,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);padding:40px">
        <tr><td>
          <p style="margin:0 0 8px;color:#C9A84C;font-size:22px;font-weight:700">ETerapy</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#f8fafc">Сброс пароля</h1>
          <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${name}!</p>
          <p style="margin:0 0 32px;color:#94a3b8;line-height:1.6">
            Мы получили запрос на сброс пароля. Ссылка действительна 1 час.
          </p>
          <a href="${url}" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
            Сбросить пароль
          </a>
          <p style="margin:32px 0 0;color:#475569;font-size:12px;line-height:1.6">
            Если вы не запрашивали сброс — просто проигнорируйте это письмо. Пароль не изменится.<br>
            Или скопируйте ссылку: <a href="${url}" style="color:#C9A84C">${url}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
