/**
 * Единое оформление писем — Soft Clarity.
 *
 * B592: до этого обёртка была скопирована в `email.ts` и `email-send.ts`, и обе
 * копии оставались в палитре Aurora — тёмно-синий фон, золото и знак «✦»,
 * которого на сайте нет с редизайна v4. Человек, подтверждающий почту, видел
 * продукт, не похожий на тот, куда он только что регистрировался. Две копии
 * означали и то, что починить это в одном месте нельзя, — поэтому здесь один
 * модуль, из которого берут все отправители, включая маркетинговые (B594).
 *
 * Ограничения почтовых клиентов, из-за которых это не копия сайта:
 * • CSS-градиенты рендерит не каждый клиент — знак приезжает растровой
 *   картинкой с прод-домена, а не рисуется стилями;
 * • шрифт Fraunces недоступен, поэтому заголовки идут безопасной антиквой;
 * • вёрстка на таблицах и inline-стилях: Outlook игнорирует `<style>` целиком,
 *   он же не поддерживает `border-radius` — кнопка там станет прямоугольной,
 *   но останется кликабельной и контрастной.
 */

export const EMAIL_INK = "#2a2422";
export const EMAIL_INK_SOFT = "#5b514c";
export const EMAIL_INK_FAINT = "#8a7e76";
export const EMAIL_PAPER = "#fbf6ee";
export const EMAIL_PAPER_CARD = "#fffcf5";
export const EMAIL_PAPER_EDGE = "#e9ddc6";
export const EMAIL_PAPER_DEEP = "#f6efe1";
export const EMAIL_BORDEAUX = "#5c2a2c";
export const EMAIL_TERRACOTTA = "#d67558";
export const EMAIL_SERIF = "Georgia,'Times New Roman',serif";
export const EMAIL_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export interface EmailWrapperOptions {
  /** Подвал письма. У транзакционных и у уведомлений он разный по закону и по смыслу. */
  footer?: string;
}

export function emailWrapper(body: string, options: EmailWrapperOptions = {}): string {
  const url = baseUrl();
  const footer = options.footer ?? `ETerapy — разбор жизненной ситуации. Не медицинская помощь и не
    замена специалисту. При угрозе жизни — 112.<br>
    <a href="${url}" style="color:${EMAIL_TERRACOTTA};text-decoration:none">eterapy.com</a>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${EMAIL_PAPER};font-family:${EMAIL_SANS};color:${EMAIL_INK}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${EMAIL_PAPER};padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:560px">
        <tr><td style="padding:0 0 20px">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="padding-right:10px" valign="middle">
              <img src="${url}/brand/halo-mark.png" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0">
            </td>
            <td valign="middle" style="font-family:${EMAIL_SERIF};font-size:21px;font-weight:600;color:${EMAIL_BORDEAUX};letter-spacing:-0.2px">ETerapy</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:${EMAIL_PAPER_CARD};border:1px solid ${EMAIL_PAPER_EDGE};border-radius:22px;padding:32px 28px">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-family:${EMAIL_SANS};color:${EMAIL_INK_FAINT};font-size:11px;line-height:1.7">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${EMAIL_TERRACOTTA};color:#ffffff;padding:13px 26px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;font-family:${EMAIL_SANS}">${label}</a>`;
}

/** Заголовок письма — антиквой, как заголовки на сайте. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${EMAIL_SERIF};font-size:24px;line-height:1.25;font-weight:600;color:${EMAIL_BORDEAUX}">${text}</h1>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${EMAIL_INK_SOFT};line-height:1.65;font-size:15px">${text}</p>`;
}

export function emailInfoBox(content: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;background:${EMAIL_PAPER_DEEP};border:1px solid ${EMAIL_PAPER_EDGE};border-radius:14px;padding:20px;width:100%">
    <tr><td>${content}</td></tr>
  </table>`;
}

export function emailRow(label: string, value: string): string {
  return `<p style="margin:0 0 4px;color:${EMAIL_INK_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.6px">${label}</p>
          <p style="margin:0 0 16px;color:${EMAIL_BORDEAUX};font-weight:600;font-size:15px">${value}</p>`;
}
