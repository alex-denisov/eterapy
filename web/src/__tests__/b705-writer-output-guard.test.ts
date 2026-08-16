/**
 * B705 — «автор прислал не пост» снимает МАРШРУТ, а не материал.
 *
 * Замер прода 2026-08-16: 113 смертей материалов за 14 суток, и заметная доля
 * из них — ответы, которые постом не были вовсе (английский лог рассуждений,
 * служебные комментарии, заглушки). Каждая стоила вызова автора, вызова
 * редактора и раунда из бюджета материала.
 *
 * Тесты держат обе границы сразу: узнаваемый мусор отвергается, а годный
 * русский пост с латиницей в терминах и обязательной ссылкой — нет. Ложное
 * срабатывание здесь дороже пропуска: отвергнутый ответ уже оплачен.
 */

import { rejectNonPostWriterOutput } from "@/lib/marketing/writer-output-guard";

const GOOD_POST = [
  "Вам приснилось, что вы падаете, и тело среагировало так, будто это правда.",
  "",
  "Ощущение падения возникает на границе сна: мышцы отпускают напряжение, а мозг ещё считывает положение тела. Один символ сам по себе не даёт толкования — важнее, что вы чувствовали при пробуждении.",
  "",
  "Разобрать свой сон: https://eterapy.com/products/dreams",
].join("\n");

describe("B705 · машина отличает пост от лога модели", () => {
  it("годный русский пост со ссылкой и латинским термином проходит", () => {
    expect(rejectNonPostWriterOutput(GOOD_POST)).toBeNull();
    expect(
      rejectNonPostWriterOutput(
        "Матрица судьбы и Human Design описывают человека разными языками, но обещают одно: "
        + "объяснить, почему с вами происходит именно это. Проверить себя можно за пять минут "
        + "на https://eterapy.com/products/matrix — расчёт бесплатный.",
      ),
    ).toBeNull();
  });

  it("русский лог рассуждений отвергается по маркеру, а не по языку", () => {
    // Опаснее английского: замер языка такой ответ проходит, и без маркера он
    // доехал бы до редактора целым раундом.
    const rejection = rejectNonPostWriterOutput(
      "Мне нужно написать пост для Telegram про символы сна, уложиться в 900 символов "
      + "и не забыть про призыв к действию в конце. Тон спокойный, без обещаний результата.",
    );
    expect(rejection?.rule).toBe("writer-reasoning-leak");
    expect(rejection?.reason).toContain("мне нужно написать");
  });

  it("английский текст без служебных маркеров всё равно отвергается по языку", () => {
    const rejection = rejectNonPostWriterOutput(
      "Dreams about falling are common and usually harmless. They often appear when the body "
      + "relaxes at the edge of sleep and the mind keeps tracking its position in space.",
    );
    expect(rejection?.rule).toBe("writer-not-russian");
    expect(rejection?.reason).toContain("кириллицы");
  });

  it("обёртка цепочки рассуждений ловится даже вокруг русского текста", () => {
    const rejection = rejectNonPostWriterOutput(
      "<think>Нужно уложиться в 900 символов и не забыть про CTA</think>\n\n" + GOOD_POST,
    );
    expect(rejection?.rule).toBe("writer-reasoning-tag");
  });

  it("служебная реплика в начале строки отвергается, а то же слово внутри предложения — нет", () => {
    expect(
      rejectNonPostWriterOutput(`Sure, here is the post you asked for:\n\n${GOOD_POST}`)?.rule,
    ).toBe("writer-reasoning-leak");
    // «Итак» и «первый» внутри живого предложения — обычные русские слова.
    expect(
      rejectNonPostWriterOutput(
        "Сон повторился трижды, и это пугает сильнее самого сюжета. Итак устроена тревога: "
        + "она ищет закономерность там, где её нет. Первый шаг — записать, что вы чувствовали "
        + "при пробуждении, а не что именно снилось. https://eterapy.com/products/dreams",
      ),
    ).toBeNull();
  });

  it("незаполненная заглушка шаблона — это не пост", () => {
    expect(
      rejectNonPostWriterOutput(GOOD_POST.replace("https://eterapy.com/products/dreams", "{{destination_url}}"))?.rule,
    ).toBe("writer-placeholder-moustache");
    expect(
      rejectNonPostWriterOutput(`${GOOD_POST}\n\n[вставьте ссылку на разбор]`)?.rule,
    ).toBe("writer-placeholder-bracket-instruction");
  });

  it("пустой ответ называется пустым, а не «не русским»", () => {
    expect(rejectNonPostWriterOutput("   \n  ")?.rule).toBe("writer-empty");
  });

  it("короткая подпись латиницей не считается английским текстом", () => {
    // Ниже порога длины доля кириллицы — шум, а не признак языка.
    expect(rejectNonPostWriterOutput("ETerapy")).toBeNull();
  });

  it("ссылки и хэштеги не портят замер языка", () => {
    const russianWithLongLink =
      "Три ночи подряд один и тот же сон — это не предсказание, а повод посмотреть, "
      + "что повторяется наяву. https://eterapy.com/products/dreams?utm_source=telegram&utm_campaign=august "
      + "#сны #психология #самонаблюдение";
    expect(rejectNonPostWriterOutput(russianWithLongLink)).toBeNull();
  });
});
