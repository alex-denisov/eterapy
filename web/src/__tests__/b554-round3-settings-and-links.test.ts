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

  it("п.3 — блок рекомендаций не слипается и не режется", () => {
    const checkin = source("src/components/dialogue/checkin-experience.tsx");
    const triage = source("src/components/products/service-triage.tsx");
    const css = source("src/app/v4-soft.css");

    // Кольцо снаружи рамки срезал предок с overflow-hidden.
    for (const file of [checkin, triage]) {
      expect(file).toContain("ring-1 ring-inset ring-[var(--soft-terracotta-dark)]");
      // Шильдик сжимался в flex-строке и переносился на 2–3 строки внутри пилюли.
      expect(file).toContain('className="shrink-0 whitespace-nowrap rounded-full bg-[var(--soft-terracotta-dark)]');
      expect(file).toContain('className="flex flex-wrap items-center gap-x-2 gap-y-1"');
    }
    // Лента висит на 0.7rem выше карточки — карточка резервирует себе запас.
    expect(css).toContain(".soft-triage-primary:has(> .soft-triage-ribbon)");
  });

  it("п.10 — пакеты баллов различаются описанием, ведут на свою вкладку и зовут купить", () => {
    const data = source("src/lib/miniapp/journey-data.ts");
    const screens = source("src/components/miniapp/journey-screens.tsx");
    const page = source("src/app/miniapp/packages/page.tsx");

    // Один и тот же список выгод у всех пакетов + обещание корзины как «выгода».
    expect(data).not.toContain('benefits: ["Для цифровых разборов", "Не сгорают в конце месяца", "Сначала показываем итоговую сумму"]');
    expect(data).toContain("Открывает до ${pack.credits}");
    expect(data).toContain("за балл");
    // Вкладка в URL: CTA «купить баллы» больше не открывает подписки.
    expect(page).toContain('initialKind={tab === "credits" ? "credits" : "subscription"}');
    expect(screens).toContain('url.searchParams.set("tab"');
    expect(screens).toContain('offer.kind === "credits" ? "Купить баллы" : "Оформить подписку"');
    expect(screens).not.toContain(">Выбрать</GateLink>");
  });

  it("п.11 — кошелёк показывает баланс, источники и движение баллов", () => {
    const wallet = source("src/components/miniapp/wallet-screen.tsx");
    const page = source("src/app/miniapp/profile/[section]/page.tsx");
    const screens = source("src/components/miniapp/journey-screens.tsx");

    expect(page).toContain("getCreditWalletSnapshot");
    expect(page).toContain('if (section === "wallet") return <WalletSection />');
    expect(wallet).toContain("откуда баллы");
    expect(wallet).toContain("движение баллов");
    expect(wallet).toContain('href="/miniapp/packages?tab=credits"');
    // Заглушка «Баллы видны в верхней панели» дублировала шапку и профиль.
    expect(screens).not.toContain('title: "Текущий баланс", text: "Баллы видны в верхней панели"');
  });

  it("п.13 — «О себе» повторяет набор полей веба", () => {
    const screens = source("src/components/miniapp/profile-settings-screens.tsx");

    for (const field of ["birthDate", "birthTime", "birthPlace", "maritalStatus", "occupation", "aiGoals"]) {
      expect(screens).toContain(field);
    }
    expect(screens).toContain('requestJson<{ profile?: ExtendedProfile | null }>("/api/auth/extended-profile")');
    expect(screens).toContain('"/api/auth/extended-profile", {\n      method: "PATCH"');
    // Справочники совпадают с cabinet/settings.
    const settings = source("src/app/cabinet/settings/settings-client.tsx");
    for (const goal of ["relationships", "career", "selfdev", "health", "finance", "family", "creativity", "spirituality"]) {
      expect(screens).toContain(`"${goal}"`);
      expect(settings).toContain(`"${goal}"`);
    }
  });

  it("п.24 — превью расклада рисуется на самой странице услуги, значения остаются платными", () => {
    const numerology = source("src/components/products/numerology-actions.tsx");

    // Схема считается детерминированно из даты — модель не нужна.
    expect(numerology).toContain("computeDestinyMatrix(parsed.day, parsed.month, parsed.year)");
    expect(numerology).toContain("parseStrictBirthDate(birth.trim())");
    expect(numerology).toContain("<DestinyMatrixChart matrix={matrix} preview />");
    // Сетка расшифрованных позиций — за оплатой (граница B450/B451).
    expect(numerology).toContain("{preview ? null : <div className=\"mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5\"");
    expect(numerology).toContain("введите дату рождения — матрица 22 энергий появится здесь же");
  });

  it("п.27 — чат не зовёт вошедшего человека войти, пока грузится сессия", () => {
    const chat = source("src/components/companion/companion-chat-panel.tsx");
    const controls = source("src/components/products/product-purchase-controls.tsx");

    expect(chat).toContain('const authPending = authStatus === "loading"');
    expect(chat).toContain("if (authPending) return;");
    expect(chat).toContain('authPending ? "Проверяем вход…"');
    // Оплата картой в мини-аппе ещё не подключена — кнопка не обещает лишнего.
    expect(controls).toContain('inMiniApp ? "Картой — скоро"');
  });

  it("п.20 — короткий месяц в записях Дневника не зависит от сборки ICU", () => {
    const serverData = source("src/lib/miniapp/server-data.ts");

    expect(serverData).toContain("SHORT_MONTHS_RU");
    expect(serverData).not.toContain('toLocaleDateString("ru-RU", { month: "short" })');
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
