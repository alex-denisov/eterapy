import { isCompleteDate, maskDateInput, maskLeadingDateInput } from "@/lib/date-input-mask";

describe("B554 п.23 — автоформат даты рождения", () => {
  it("доклеивает разделители по мере ввода", () => {
    // Ровно сценарий владельца: «я ввожу цифры 111, а приложение само ставит
    // точку после 11».
    expect(maskDateInput("1")).toBe("1");
    expect(maskDateInput("11")).toBe("11.");
    expect(maskDateInput("111")).toBe("11.1");
    expect(maskDateInput("1105")).toBe("11.05.");
    expect(maskDateInput("110519")).toBe("11.05.19");
    expect(maskDateInput("11051990")).toBe("11.05.1990");
  });

  it("не тянет за собой лишние цифры и мусорные символы", () => {
    expect(maskDateInput("11.05.1990")).toBe("11.05.1990");
    expect(maskDateInput("11051990777")).toBe("11.05.1990");
    // Маска не разбирает словесные месяцы — она только раскладывает ЦИФРЫ по
    // блокам. Поэтому её место — поля чистой даты (числовой портрет), но не
    // составные вроде «12.04.1992, 14:35, Москва» у натальной карты.
    expect(maskDateInput("11 мая 1990")).toBe("11.19.90");
    expect(maskDateInput("")).toBe("");
    expect(maskDateInput("абв")).toBe("");
  });

  it("не возвращает точку, которую пользователь только что стёр", () => {
    // Без этого стирание залипало: backspace убирал точку, маска ставила её
    // обратно, и поле не пустело.
    expect(maskDateInput("11", "11.")).toBe("11");
    expect(maskDateInput("11.05", "11.05.")).toBe("11.05");
  });

  it("узнаёт полную дату", () => {
    expect(isCompleteDate("11.05.1990")).toBe(true);
    expect(isCompleteDate("  11.05.1990 ")).toBe(true);
    expect(isCompleteDate("11.05.19")).toBe(false);
    expect(isCompleteDate("41.05.1990")).toBe(false);
    expect(isCompleteDate("11.13.1990")).toBe(false);
    expect(isCompleteDate("11.05.1850")).toBe(false);
    expect(isCompleteDate(`11.05.${new Date().getFullYear() + 1}`)).toBe(false);
  });
});

describe("B554 п.23 — автоформат ведущей даты в СОСТАВНОМ поле", () => {
  // Натальная карта и синастрия принимают «12.04.1992, 14:35, Москва».
  // Обычная числовая маска такое поле ломает (склеит время и индекс города в
  // дату), поэтому форматируется только ведущая дата, а хвост не трогается.
  it("форматирует дату, пока человек её набирает", () => {
    expect(maskLeadingDateInput("1")).toBe("1");
    expect(maskLeadingDateInput("11")).toBe("11.");
    expect(maskLeadingDateInput("111")).toBe("11.1");
    expect(maskLeadingDateInput("1204")).toBe("12.04.");
    expect(maskLeadingDateInput("12041992")).toBe("12.04.1992");
  });

  it("замолкает, как только дата набрана и человек пишет время и город", () => {
    expect(maskLeadingDateInput("12.04.1992 ")).toBe("12.04.1992 ");
    expect(maskLeadingDateInput("12.04.1992, 14:35")).toBe("12.04.1992, 14:35");
    expect(maskLeadingDateInput("12.04.1992, 14:35, Москва")).toBe("12.04.1992, 14:35, Москва");
    // Ключевая защита: минуты и цифры в названии города НЕ утягиваются в дату.
    expect(maskLeadingDateInput("12.04.1992, 14:35, Ростов-на-Дону 344000"))
      .toBe("12.04.1992, 14:35, Ростов-на-Дону 344000");
  });

  it("не вмешивается, если поле начинается не с даты", () => {
    expect(maskLeadingDateInput("Москва, 12 апреля")).toBe("Москва, 12 апреля");
  });

  it("не возвращает точку, которую только что стёрли", () => {
    expect(maskLeadingDateInput("12", "12.")).toBe("12");
  });
});
