import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(pathname: string): string {
  return readFileSync(join(process.cwd(), pathname), "utf8");
}

describe("B554 round 3 — настройки профиля и ссылки-приглашения", () => {
  describe("п.12 — ссылка приглашения на одном домене", () => {
    const ORIGINAL = { ...process.env };

    afterEach(() => {
      process.env = { ...ORIGINAL };
      jest.resetModules();
    });

    async function loadShareLandingUrl(env: Record<string, string | undefined>) {
      jest.resetModules();
      process.env = { ...ORIGINAL, ...env };
      const module = await import("@/lib/share-referral");
      return module.shareLandingUrl;
    }

    it("строит абсолютную ссылку, когда сайт живёт на одном домене", async () => {
      // Именно эта конфигурация роняла POST /api/referral/link в 500: mainUrl
      // отдавал "/share", а new URL("/share") без базы кидает TypeError.
      const shareLandingUrl = await loadShareLandingUrl({
        NEXT_PUBLIC_USE_SUBDOMAINS: undefined,
        NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY: undefined,
        NEXT_PUBLIC_APP_URL: "https://eterapy.com",
      });

      const url = shareLandingUrl("tok3n", "referral");

      expect(url).toBe("https://eterapy.com/share?token=tok3n&from=referral");
    });

    it("сохраняет поддоменную ссылку, когда поддомены включены", async () => {
      const shareLandingUrl = await loadShareLandingUrl({
        NEXT_PUBLIC_USE_SUBDOMAINS: "true",
        NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY: "false",
        NEXT_PUBLIC_MAIN_DOMAIN: "eterapy.com",
      });

      const url = shareLandingUrl("tok3n", "referral", "тема");

      expect(url).toContain("https://eterapy.com/share?token=tok3n&from=referral");
    });
  });

  it("п.9/14/15 — кнопки не меняют ширину от появления сообщения об ошибке", () => {
    // Комментарии вырезаем: они пересказывают старые селекторы, а проверяем мы
    // именно действующие правила.
    const css = source("src/app/miniapp/miniapp-v21.module.css").replace(/\/\*[\s\S]*?\*\//g, "");

    // Ширину возвращали хрупкие соседские селекторы; условный <p> с ошибкой
    // рвал соседство и кнопка прыгала с 195px на 308px.
    expect(css).not.toContain(".quiet-hours + .journey-primary");
    expect(css).not.toContain(".invite-native-card + .journey-primary");
    expect(css).not.toContain("width: fit-content;\n  max-width: 100%;");
  });

  it("п.12 — дисклеймер выкладывается строкой «иконка + текст»", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    const flowNote = css.slice(css.indexOf(".flow-note {"), css.indexOf(".flow-note svg"));

    expect(flowNote).toContain("display: flex");
    expect(flowNote).toContain("align-items: flex-start");
  });

  it("п.9 — сбой загрузки настроек не выдаётся за сбой сохранения", () => {
    const screens = source("src/components/miniapp/profile-settings-screens.tsx");

    expect(screens).toContain("const [loadFailure, setLoadFailure]");
    expect(screens).toContain("const [saveFailure, setSaveFailure]");
    expect(screens).toContain("Сессия истекла. Войдите в аккаунт ещё раз.");
    // Мёртвые переключатели поверх пустого списка больше не показываем.
    expect(screens).toContain("loadFailure ? <FailureNote failure={loadFailure} onRetry={() => void load()} />");
  });

  it("п.15 — архив данных забирается запросом и объясняет отказ", () => {
    const screens = source("src/components/miniapp/profile-settings-screens.tsx");

    expect(screens).toContain("async function exportArchive()");
    expect(screens).toContain('link.download = "eterapy-personal-data.json"');
    expect(screens).not.toContain('href="/api/auth/export-data"');
  });

  it("п.17 — отказ восстановления разбора объясняется по-русски, а не строкой API", async () => {
    const { restoreErrorMessage } = await import("@/components/dialogue/checkin-experience");
    const experience = source("src/components/dialogue/checkin-experience.tsx");

    expect(restoreErrorMessage(401)).toContain("Сессия истекла");
    expect(restoreErrorMessage(403)).toContain("Сессия истекла");
    expect(restoreErrorMessage(404)).toContain("не найден");
    expect(restoreErrorMessage(500)).toContain("Попробуйте ещё раз");
    // Раньше сюда попадало английское «Dialogue not found» прямо из ответа API.
    expect(experience).not.toContain('typeof data.error === "string" ? data.error : "Диалог не найден"');
    // И пустая форма нового вопроса поверх загрузки готового разбора.
    expect(experience).toContain('phase === "question" && restoring');
    expect(experience).toContain('phase === "question" && !restoring');
  });

  it("п.18 — разборы выдаются по четыре, фильтр строится по типу записи", () => {
    const screen = source("src/components/miniapp/screens/diary-screen.tsx");
    const css = source("src/app/miniapp/miniapp-v21.module.css");

    expect(screen).toContain("const DIARY_PAGE_SIZE = 4");
    expect(screen).toContain("filtered.slice(0, visibleItems)");
    expect(screen).toContain("Показать ещё (");
    // Фильтр по `topic` давал две одинаковые кнопки: «Все» и «Личное».
    expect(screen).toContain("new Set(data.diaryItems.map((item) => item.type))");
    expect(screen).toContain('data.diaryItems.filter((item) => item.type === topic)');
    // Стрелка ссылки перестала залезать под кнопку «поделиться» (44px + 2px).
    expect(css).toContain("padding: 8px 56px 8px 8px");
  });

  it("п.20 — «Ваши записи» показывают дни практики, а не последние разборы", () => {
    const screen = source("src/components/miniapp/screens/diary-screen.tsx");
    const serverData = source("src/lib/miniapp/server-data.ts");
    const types = source("src/lib/miniapp/types.ts");

    expect(serverData).toContain("listJournalEntries(viewer.id, 7)");
    expect(types).toContain("MiniAppJournalEntry");
    expect(screen).toContain("data.journalEntries.map((entry)");
    expect(screen).toContain("activeJournal.fullDateLabel");
    expect(screen).toContain('activeJournal.own ? "ваш вопрос" : "вопрос дня"');
    // Ряд из пяти последних РАЗБОРОВ («20, 20, 20, 20, 17») ушёл.
    expect(screen).not.toContain("data.diaryItems.slice(0, 5)");
    // Наблюдение больше не строится на теме-заглушке.
    expect(screen).toContain("if (item.topic === GENERIC_TOPIC) continue;");
  });

  it("п.19 — замок Дневника открывает PIN, а не смену пароля аккаунта", () => {
    const screen = source("src/components/miniapp/screens/diary-screen.tsx");
    const pin = source("src/components/miniapp/diary-pin.tsx");

    expect(screen).toContain("<MiniAppDiaryPinButton />");
    expect(screen).toContain("<MiniAppDiaryPinGate>");
    expect(screen).not.toContain('href="/miniapp/profile/security" aria-label="Защита Дневника"');
    // Механики те же, что в вебе — общий lib/diary-pin, без своей криптографии.
    expect(pin).toContain('from "@/lib/diary-pin"');
    expect(pin).toContain("shouldLockDiary");
    expect(pin).toContain("verifyDiaryPin");
    expect(pin).toContain("hashDiaryPin");
  });

  it("п.21 — сегменты фильтра не переносятся на две строки", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    const segment = css.slice(css.indexOf(".minimal-segment > div {"), css.indexOf(".minimal-segment button::before"));

    // Строго равные колонки не вмещали «Со специалистом».
    expect(segment).not.toContain("grid-auto-columns: 1fr");
    expect(segment).toContain("white-space: nowrap");
    expect(segment).toContain("overflow-x: auto");
  });

  it("п.22 — у карточек услуг свои короткие подписи, а не первое предложение веба", () => {
    const catalog = source("src/lib/miniapp/catalog.ts");

    expect(catalog).toContain("MINIAPP_SUMMARY");
    expect(catalog).toContain("compactSummary(product.slug, product.summary)");
    // В карточке шириной 150px помещается около 45 символов на три строки.
    const block = catalog.slice(catalog.indexOf("const MINIAPP_SUMMARY"), catalog.indexOf("function compactSummary"));
    const summaries = [...block.matchAll(/"([^"]{10,})",?\s*$/gm)].map((match) => match[1]);
    expect(summaries.length).toBeGreaterThanOrEqual(13);
    for (const summary of summaries) expect(summary.length).toBeLessThanOrEqual(45);
  });

  it("п.25 — обязательные поля проверяются ДО списания баллов", () => {
    const controls = source("src/components/products/product-purchase-controls.tsx");
    const numerology = source("src/components/products/numerology-actions.tsx");
    const natal = source("src/components/products/natal-chart-actions.tsx");
    const family = source("src/components/products/family-scenarios-actions.tsx");

    expect(controls).toContain("beforePay?: () => string | null");
    expect(controls).toContain("if (blockedByInput()) return;");
    // «Можно оплатить картой» приклеивалось к любому отказу, включая пустой ответ.
    expect(controls).not.toContain("setMessage(`${text}. Можно оплатить картой.`)");

    for (const service of [numerology, natal, family]) {
      expect(service).toContain("beforePay={missingInput}");
      expect(service).toContain("function missingInput(): string | null");
      // «Доступ открыт, а теперь заполните поля» — это уже после списания.
      expect(service).not.toContain("Доступ открыт. Добавьте");
    }
    // Предупреждение гаснет, как только человек пишет в это поле.
    expect(numerology).toContain('if (fieldWarnings.name) setFieldWarnings((current) => ({ ...current, name: false }))');
    expect(numerology).toContain('if (fieldWarnings.birth) setFieldWarnings((current) => ({ ...current, birth: false }))');
  });

  it("п.14 — смена пароля без пароля у аккаунта отвечает понятной ошибкой, а не 500", () => {
    const route = source("src/app/api/auth/change-password/route.ts");
    const guard = route.indexOf("if (!user.password)");
    const compare = route.indexOf("await bcrypt.compare(");

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(compare);
    expect(route).toContain("У аккаунта ещё нет пароля");
  });
});
