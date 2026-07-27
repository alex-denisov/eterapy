/**
 * Батч №12 — инварианты, которые нельзя потерять обратно.
 *
 * Каждый блок здесь фиксирует не «как написано», а ПОЧЕМУ так: под каждым стоит
 * либо потерянные деньги, либо обещание пользователю, которое платформа не
 * держала.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("INC-081 · оплата обязана дойти до зачисления", () => {
  it("сверка ищет платежи БОЕВОГО провайдера, а не только унаследованного", () => {
    const route = read("src/app/api/billing/reconcile/route.ts");
    // Раньше сверка фильтровала `provider: "yookassa"` и не видела ни одного
    // платежа Robokassa. Из-за этого «Подтверждаем оплату и открываем
    // доступ…» висело вечно: страница шесть раз спрашивала о платеже, который
    // сверка не умела искать.
    expect(route).toContain("reconcileRobokassaForUser");
  });

  it("состояние платежа спрашивается у провайдера, а не додумывается", () => {
    const lib = read("src/lib/payments/reconcile-robokassa.ts");
    expect(lib).toContain("fetchOperationState");
    // Ключевое правило: «провайдер недоступен» ≠ «не оплачено». Неизвестное
    // состояние обязано оставить транзакцию PENDING, иначе одна сетевая
    // ошибка отменит оплаченный заказ.
    expect(lib).toContain('outcome: "unknown"');
    expect(lib).toContain("cancelPendingPayment");
  });

  it("зачисление в сверке идёт тем же путём, что и в колбэке", () => {
    // Иначе появится второй способ выдать товар — и второй способ выдать его дважды.
    expect(read("src/lib/payments/reconcile-robokassa.ts")).toContain("creditSucceededPayment");
  });

  it("нераспознанный колбэк называет, ЧТО именно пришло", () => {
    const route = read("src/app/api/billing/robokassa-result/route.ts");
    expect(route).toContain("paramNames");
    expect(route).toContain("contentType");
    // Подпись в лог не попадает.
    expect(route).not.toContain("signatureValue: params");
  });
});

describe("INC-082 · описание ситуации переживает уход на оплату", () => {
  it("черновик снимается ДО навигации во внешний контур", () => {
    const controls = read("src/components/products/product-purchase-controls.tsx");
    const saveAt = controls.indexOf("saveProductDraft(productKey, draft())");
    const navigateAt = controls.indexOf("window.location.href = payload.confirmationUrl");
    expect(saveAt).toBeGreaterThan(-1);
    expect(saveAt).toBeLessThan(navigateAt);
  });

  it("черновик живёт в sessionStorage и не переживает вкладку", () => {
    const lib = read("src/lib/product-draft.ts");
    expect(lib).toContain("sessionStorage");
    expect(lib).not.toContain("localStorage");
  });

  it("услуги со свободным вводом восстанавливают форму при возврате", () => {
    for (const file of [
      "src/components/products/reframe-actions.tsx",
      "src/components/products/deep-report-actions.tsx",
    ]) {
      expect(read(file)).toContain("loadProductDraft");
    }
  });
});

describe("INC-083 · подтверждение почты снимает плашку", () => {
  it("токен перечитывает признак подтверждения, пока он не выставлен", () => {
    const auth = read("src/lib/auth.ts");
    // Подтверждение происходит ВНЕ сессии — человек уходит в почтовый клиент.
    // Без перечитывания в токене навсегда остаётся состояние на момент входа.
    expect(auth).toContain("evCheckedAt");
    expect(auth).toContain('trigger === "update"');
  });
});

describe("INC-084 · привязка карты не ведёт к чужому провайдеру", () => {
  it("кабинет не вызывает эндпоинт привязки через ЮKassa", () => {
    const panel = read("src/components/cabinet/billing-panel.tsx");
    expect(panel).not.toContain("/api/billing/save-card");
    expect(panel).not.toContain("защищён через ЮKassa");
  });

  it("B602: блока карт больше нет, а сам эндпоинт удаления остался", () => {
    // Владелец 2026-07-27 просил убрать блок целиком, а не оставлять заглушку.
    // Право удалить сохранённое при этом не пропало — DELETE на месте.
    expect(read("src/components/cabinet/billing-panel.tsx")).not.toContain("handleRemoveCard");
    expect(read("src/app/api/billing/cards/route.ts")).toContain("export async function DELETE");
  });
});

describe("B592 · письма выглядят как продукт, в который человек зарегистрировался", () => {
  it("оформление писем живёт в одном модуле", () => {
    for (const file of ["src/lib/email.ts", "src/lib/email-send.ts"]) {
      expect(read(file)).toContain("@/lib/email-theme");
    }
  });

  it("палитра Aurora и знак «✦» из писем убраны", () => {
    for (const file of ["src/lib/email.ts", "src/lib/email-send.ts", "src/lib/email-theme.ts"]) {
      const src = read(file);
      expect(src).not.toContain("#0D1B2A");
      expect(src).not.toContain("#C9A84C");
      expect(src).not.toContain("✦ ETerapy");
    }
  });

  it("знак приезжает картинкой: почтовые клиенты не рисуют CSS-градиенты", () => {
    expect(read("src/lib/email-theme.ts")).toContain("/brand/halo-mark.png");
    expect(fs.existsSync(path.join(root, "public/brand/halo-mark.png"))).toBe(true);
  });

  it("в подвале нет снятого обещания про развлекательный характер услуг", () => {
    expect(read("src/lib/email-theme.ts")).not.toContain("развлекательный");
  });
});

describe("B593 → B605 · «Ежедневная практика» не живёт вторым экраном", () => {
  it("старый /cabinet/modalities всё ещё переадресуется", () => {
    // B605 (владелец 2026-07-27): «/practice удаляй, у нас до этого нет ни
    // одного живого клиента, который мог бы воспользоваться этой страницей».
    // Заботиться о разосланных ссылках было не о ком — переадресации сняты.
    // /cabinet/modalities владелец удалить не просил, он и остался.
    expect(read("src/app/cabinet/modalities/page.tsx")).toContain("permanentRedirect");
  });

  it("внутренние ссылки ведут туда, где ритуал действительно есть", () => {
    for (const file of [
      "src/lib/missions.ts",
      "src/lib/diary.ts",
      "src/lib/notification-delivery.ts",
      "src/lib/reactivation-cron.ts",
    ]) {
      expect(read(file)).not.toContain("/cabinet/practice");
    }
  });
});

describe("B594 · вход в каталог виден и называет действие", () => {
  it("подпись — глагол, а не «Услуги»", () => {
    const nav = read("src/lib/nav-model.ts");
    expect(nav).toContain('label: "Разобрать"');
    expect(nav).not.toContain('label: "Услуги"');
  });

  it("акцент навешивается по адресу, а не по подписи", () => {
    // Иначе следующее переименование молча снимет выделение.
    const header = read("src/components/header.tsx");
    expect(header).toContain('item.href.includes("/products")');
    expect(header).not.toContain('item.label === "Услуги"');
  });
});

describe("B595 · длинная статья не стоит между входом в воронку и подвалом", () => {
  it("главная её больше не рендерит", () => {
    expect(read("src/app/page.tsx")).not.toContain("HomeAuthorityArticle");
  });

  it("статья и её разметка живут на своём URL", () => {
    expect(read("src/app/how-it-works/page.tsx")).toContain("<HomeAuthorityArticle />");
    const content = read("src/lib/home-authority-content.ts");
    expect(content).toContain("how-it-works#article");
    expect(content).toContain("how-it-works#faq");
  });
});

describe("B596 · библиотека — один список, темы — в чипах", () => {
  it("переключателя разделов нет", () => {
    const page = read("src/app/library/page.tsx");
    expect(page).not.toContain("Направление библиотеки");
    expect(page).toContain("approvedLibraryEntries()");
    expect(page).toContain("libraryTopics()");
  });

  it("старое значение фильтра не открывает пустую библиотеку", () => {
    const cta = read("src/lib/library-cta.ts");
    expect(cta).toContain("resolveLibraryTopic");
    expect(cta).toContain('"Хожу по кругу": "Повторяется одно и то же"');
  });

  it("тема названа так, как о ней говорят люди", () => {
    expect(read("src/lib/library-cta.ts")).toContain('"Повторяется одно и то же"');
  });
});

describe("INC-085 · фолбэк загрузки совпадает с областью, которая меняется", () => {
  it("в кабинете он не оверлей на весь вьюпорт", () => {
    const src = read("src/components/cabinet/cabinet-route-loading.tsx");
    expect(src).not.toContain("fixed inset-0");
    expect(read("src/app/cabinet/loading.tsx")).toContain("cabinet-route-loading");
  });
});

describe("INC-081 · зависшая оплата не ждёт человека", () => {
  it("досверка стоит в расписании воркера, а не запускается руками", () => {
    const scheduler = read("src/lib/cron-scheduler.ts");
    expect(scheduler).toContain('type: "cron.billing-reconcile-pending"');
    expect(scheduler).toContain('cadence: "hourly"');
    // НЕ financial: джоб ничего не списывает, а дочитывает у провайдера уже
    // случившееся. Под гейтом финансовых джобов страховка была бы выключена
    // ровно там, где она нужна.
    const line = scheduler.split("\n").find((l) => l.includes("cron.billing-reconcile-pending")) ?? "";
    expect(line).not.toContain("financial: true");
  });

  it("у джоба есть обработчик", () => {
    expect(read("src/lib/cron-jobs.ts")).toContain('"cron.billing-reconcile-pending": runBillingReconcilePendingJob');
  });
});
