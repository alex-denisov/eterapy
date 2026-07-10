import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P3-детали — мобильные экраны календаря 1-в-1 по макетам:
//   practitioner-calendar-session / -propose / -reschedule / -cancel.html.
// Owner: внедряем дизайн 1-в-1 (токены/формы/цвета из mockup-CSS, платформенные
// шрифты); НЕ копируем старые страницы; десктоп не трогаем до R9-5 (обёрнут
// hidden md:block, серверные data-loaders переиспользуются). Тем же API, что и
// десктоп: proposals / change-requests / PATCH bookings.

const CAL = "src/app/cabinet/practitioner/calendar";

describe("R9-4 P3 — cockpit CSS: detail-screen primitives (mockup-exact)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("adds danger tokens for the cancel screen with the exact mockup values", () => {
    const styles = css();
    expect(styles).toContain("--pc-danger-bg: #F6E4E0");
    expect(styles).toContain("--pc-danger-edge: #E4B9B0");
  });

  it("keeps platform fonts — no mockup Google fonts leak into the new section", () => {
    const styles = css();
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });

  it("defines the session card, join hint and AI row", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-sesscard\s*\{[^}]*border-radius:\s*18px/);
    expect(styles).toContain(".pcab-sc-chip.status");
    expect(styles).toContain(".pcab-joinhint");
    expect(styles).toContain(".pcab-airow");
    expect(styles).toContain(".pcab-row-t.danger");
  });

  it("defines the propose primitives: client-pick, 2-col segment, field-input, duration grid, total", () => {
    const styles = css();
    expect(styles).toContain(".pcab-cpick");
    expect(styles).toMatch(/\.pcab-seg2\s*\{[^}]*repeat\(2, 1fr\)/);
    expect(styles).toContain(".pcab-fieldinput");
    expect(styles).toMatch(/\.pcab-dur3\s*\{[^}]*repeat\(3, 1fr\)/);
    expect(styles).toContain(".pcab-total-v");
    expect(styles).toMatch(/\.pcab-btn\.block\s*\{[^}]*width:\s*100%/);
  });

  it("defines the reschedule/cancel shared «current» card + change-arrow + warn box", () => {
    const styles = css();
    expect(styles).toContain(".pcab-current");
    expect(styles).toContain(".pcab-changearrow");
    expect(styles).toMatch(/\.pcab-warn\s*\{[^}]*var\(--pc-danger-bg\)/);
    expect(styles).toContain(".pcab-warn-list");
    expect(styles).toContain(".pcab-rchip");
    expect(styles).toContain(".pcab-btn-danger");
  });
});

describe("R9-4 P3 — «Сессия» (booking/[id]) mobile 1-в-1", () => {
  const page = () => source(`${CAL}/booking/[id]/page.tsx`);
  const mobile = () => source(`${CAL}/booking/[id]/booking-mobile.tsx`);

  it("page splits: mobile mockup view + untouched desktop wrapped hidden md:block", () => {
    const p = page();
    expect(p).toContain("PractitionerBookingMobile");
    expect(p).toMatch(/className="[^"]*hidden[^"]*md:block[^"]*"/);
    expect(mobile()).toContain("md:hidden");
    expect(mobile()).toContain("data-pcab-top");
  });

  it("reuses the SAME join rule (canJoinBooking) — no new gate logic in the mobile view", () => {
    expect(page()).toContain("canJoinBooking");
    expect(page()).toContain("joinable={joinable}");
    // мобайл получает флаг пропсом, а не пересчитывает окно T-30 сам
    expect(mobile()).not.toContain("canJoinBooking");
  });

  it("carries the mockup vocabulary: hero meta, session chips, T-30 join, AI row", () => {
    const v = mobile();
    expect(v).toContain("-я сессия");
    expect(v).toContain("Войти в сессию");
    expect(v).toContain("Откроется за 30 минут до начала");
    expect(v).toContain("AI-разбор");
  });

  it("keeps the four mockup action rows (перенести/отменить/сообщение/карточка)", () => {
    const v = mobile();
    expect(v).toContain("Перенести");
    expect(v).toContain("Отменить сессию");
    expect(v).toContain("Сообщение клиенту");
    expect(v).toContain("Открыть карточку клиента");
    // «Отменить» — опасное действие (бордо-титул) с warm-иконкой как в макете
    expect(v).toContain("pcab-row-t danger");
    expect(v).toContain("pcab-row-ic warm");
  });

  it("does NOT render a fake per-session AI toggle — routes control to «Разборы и AI»", () => {
    const v = mobile();
    expect(v).not.toContain("pcab-toggle");
    expect(v).toContain("/practitioner/ai-usage");
  });
});

describe("R9-4 P3 — «Записать клиента» (propose) mobile 1-в-1", () => {
  const page = () => source(`${CAL}/propose/page.tsx`);
  const mobile = () => source(`${CAL}/propose/propose-mobile.tsx`);

  it("page splits mobile/desktop and keeps the desktop ProposeForm untouched", () => {
    const p = page();
    expect(p).toContain("ProposeMobile");
    expect(p).toContain("ProposeForm");
    expect(p).toMatch(/className="[^"]*hidden[^"]*md:block[^"]*"/);
    expect(mobile()).toContain("data-pcab-top");
  });

  it("uses the SAME endpoint as desktop (/api/practitioner/proposals)", () => {
    expect(mobile()).toContain("/api/practitioner/proposals");
  });

  it("renders the mockup blocks: client-pick sheet, format segment, duration grid, total, send-note", () => {
    const v = mobile();
    expect(v).toContain("pcab-cpick");
    expect(v).toContain("pcab-seg2");
    expect(v).toContain("Индивидуальная");
    expect(v).toContain("Парная");
    expect(v).toContain("propose-durations");
    expect(v).toContain("Клиент оплатит");
    expect(v).toContain("Отправить предложение");
  });

  it("has NO comment field (mockup omits it) and pairs are flagged as not-yet-available", () => {
    const v = mobile();
    expect(v).not.toContain("Комментарий");
    expect(v).toContain("Парные сессии");
  });
});

describe("R9-4 P3 — «Перенести» (reschedule) mobile 1-в-1", () => {
  const page = () => source(`${CAL}/booking/[id]/reschedule/page.tsx`);
  const mobile = () => source(`${CAL}/booking/[id]/reschedule/reschedule-mobile.tsx`);

  it("page splits mobile/desktop; desktop RescheduleForm untouched", () => {
    const p = page();
    expect(p).toContain("RescheduleMobile");
    expect(p).toContain("RescheduleForm");
    expect(p).toMatch(/className="[^"]*hidden[^"]*md:block[^"]*"/);
  });

  it("proposes (never applies) via the SAME change-requests endpoint, type RESCHEDULE", () => {
    const v = mobile();
    expect(v).toContain("/change-requests");
    expect(v).toContain('type: "RESCHEDULE"');
    expect(v).toContain("Предложить перенос");
  });

  it("shows current→new preview and the «за сутки — без штрафа» note", () => {
    const v = mobile();
    expect(v).toContain("pcab-changearrow");
    expect(v).toContain("Перенос за сутки и раньше — без штрафа");
  });
});

describe("R9-4 P3 — «Отмена сессии» (cancel) mobile 1-в-1", () => {
  const page = () => source(`${CAL}/booking/[id]/cancel/page.tsx`);
  const mobile = () => source(`${CAL}/booking/[id]/cancel/cancel-mobile.tsx`);

  it("page splits mobile/desktop; desktop CancelBookingForm untouched", () => {
    const p = page();
    expect(p).toContain("CancelMobile");
    expect(p).toContain("CancelBookingForm");
    expect(p).toMatch(/className="[^"]*hidden[^"]*md:block[^"]*"/);
  });

  it("cancels via the SAME endpoint (PATCH bookings, status CANCELLED, reason)", () => {
    const v = mobile();
    expect(v).toContain("/api/bookings/");
    expect(v).toContain('"CANCELLED"');
    expect(v).toContain("reason");
  });

  it("shows the B484 warning: full refund + notice + late-cancel priority impact", () => {
    const v = mobile();
    expect(v).toContain("полный возврат");
    expect(v).toContain("уведомление об отмене");
    expect(v).toContain("снижают ваш приоритет в каталоге");
  });

  it("offers the four mockup reason chips and a reschedule-instead nudge", () => {
    const v = mobile();
    for (const r of ["Болезнь", "Форс-мажор", "Перенос невозможен", "Другое"]) {
      expect(v).toContain(r);
    }
    expect(v).toContain("Не отменять");
    expect(v).toContain("перенести");
  });

  it("computes a dynamic lead-time warning (days vs «менее чем за 24 часа»)", () => {
    const v = mobile();
    expect(v).toContain("менее чем за 24 часа до начала");
    expect(v).toContain("Вы отменяете");
  });
});
