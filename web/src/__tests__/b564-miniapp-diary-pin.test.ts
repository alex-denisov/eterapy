import fs from "node:fs";
import path from "node:path";

import { shouldLockDiary } from "@/lib/diary-pin";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const PIN = "src/components/miniapp/diary-pin.tsx";
const DIALOGUES = "src/components/miniapp/screens/dialogues-screen.tsx";
const CSS = "src/app/miniapp/miniapp-v21.module.css";

describe("B564 — PIN Дневника в мини-аппе", () => {
  it("установка PIN закрывает Дневник сразу", () => {
    const pin = source(PIN);
    const create = pin.slice(pin.indexOf("async function createPin"), pin.indexOf("async function changePin"));

    // Метка разблокировки НЕ ставится — она и держала Дневник открытым после
    // включения PIN, вопреки ожиданию владельца.
    expect(create).toContain("sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY)");
    expect(create).not.toContain("sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY");

    // Именно это состояние и читает гейт: метки нет → закрыто.
    expect(shouldLockDiary(null, Date.now())).toBe(true);
  });

  it("смена PIN оставляет Дневник открытым — текущий PIN уже подтверждён", () => {
    const pin = source(PIN);
    const change = pin.slice(pin.indexOf("async function changePin"), pin.indexOf("async function removePin"));

    expect(change).toContain("verifyDiaryPin(current, record)");
    expect(change).toContain("sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()))");
  });

  it("замок открывает три действия, «отключить» — отдельной строкой", () => {
    const pin = source(PIN);

    expect(pin).toContain('data-testid="miniapp-diary-pin-unlock-action"');
    expect(pin).toContain('data-testid="miniapp-diary-pin-change-action"');
    expect(pin).toContain('data-testid="miniapp-diary-pin-disable-action"');
    // Отдельная строка = свой контейнер с отбивкой, а не соседняя кнопка.
    expect(pin).toContain('styles["diary-pin-danger-row"]');
    expect(source(CSS)).toMatch(/\.diary-pin-danger-row\s*\{[^}]*border-top/);
  });

  it("смена и отключение — отдельные окна, отключение с подтверждением", () => {
    const pin = source(PIN);

    expect(pin).toContain('type SheetMode = "create" | "menu" | "unlock" | "change" | "disable"');
    expect(pin).toContain('{mode === "change" ? (');
    expect(pin).toContain('{mode === "disable" ? (');
    // Подтверждение — текущим PIN, иначе снять замок мог бы кто угодно с
    // телефоном в руках.
    const disable = pin.slice(pin.indexOf("async function removePin"), pin.indexOf("async function unlockNow"));
    expect(disable).toContain("verifyDiaryPin(current, record)");
    expect(pin).toContain('data-testid="miniapp-diary-pin-disable-confirm"');
  });

  it("модалка считается от видимой высоты, а не от лэйаутного вьюпорта", () => {
    const css = source(CSS);
    const sheet = css.slice(css.indexOf(".diary-pin-sheet {"), css.indexOf(".diary-pin-panel {"));

    expect(sheet).toContain("height: var(--miniapp-viewport-height, 100dvh)");
    expect(sheet).not.toContain("inset: 0;");
    expect(css).toContain(':global(html[data-miniapp-keyboard-open="true"]) .diary-pin-sheet');
  });

  it("закрытый Дневник закрывает и список диалогов тем же фреймом", () => {
    const dialogues = source(DIALOGUES);

    expect(dialogues).toContain('import { MiniAppDiaryPinGate } from "@/components/miniapp/diary-pin"');
    expect(dialogues).toContain("<MiniAppDiaryPinGate");
    expect(dialogues).toContain('testId="miniapp-dialogues-pin-lock"');
    // Заголовок и «новый вопрос» остаются снаружи гейта: закрытый Дневник не
    // должен мешать задать новый вопрос.
    expect(dialogues.indexOf('href="/miniapp/dialogues/new"')).toBeLessThan(dialogues.indexOf("<MiniAppDiaryPinGate"));
  });

  it("гейт параметризуется, но остаётся тем же фреймом", () => {
    const pin = source(PIN);

    expect(pin).toContain('title = "Дневник закрыт PIN-кодом"');
    expect(pin).toContain('action = "Открыть Дневник"');
    expect(pin).toContain('styles["diary-pin-lock"]');
  });
});
