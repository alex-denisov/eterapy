// Pure tarot deck data + name lookup — NO server imports (no ai/db/pg). Lives in
// its own module so CLIENT components (card visuals) can resolve a card by name
// without dragging the server-only symbolic-products graph (→ pg → net/tls) into
// the browser bundle. `symbolic-products` re-exports these for existing importers.

export type TarotDeckCard = {
  code: string;
  name: string;
  arcana: "major" | "minor";
  glyph: string;
  suit?: string;
  rank?: string;
  upright: string;
  reversedMeaning: string;
};

export type TarotCard = TarotDeckCard & {
  position: string;
  meaning: string;
  uprightMeaning: string;
  reversedMeaning: string;
  reversed: boolean;
};

const TAROT_MAJOR_ARCANA: TarotDeckCard[] = [
  { code: "major-00", name: "Шут", arcana: "major", glyph: "0", upright: "новое начало, доверие пути", reversedMeaning: "неосторожность, импульс без опоры" },
  { code: "major-01", name: "Маг", arcana: "major", glyph: "I", upright: "воля и ресурсы уже под рукой", reversedMeaning: "рассеянность, ресурс используется не туда" },
  { code: "major-02", name: "Верховная Жрица", arcana: "major", glyph: "II", upright: "интуиция, тихое знание", reversedMeaning: "закрытость, трудность услышать себя" },
  { code: "major-03", name: "Императрица", arcana: "major", glyph: "III", upright: "забота, рост, плодородие", reversedMeaning: "истощение заботой, нехватка питания" },
  { code: "major-04", name: "Император", arcana: "major", glyph: "IV", upright: "опора, структура, границы", reversedMeaning: "жёсткость, контроль вместо опоры" },
  { code: "major-05", name: "Иерофант", arcana: "major", glyph: "V", upright: "опыт, традиция, наставник", reversedMeaning: "чужое правило, которое пора проверить" },
  { code: "major-06", name: "Влюблённые", arcana: "major", glyph: "VI", upright: "выбор сердца и ценностей", reversedMeaning: "расхождение ценностей, избегание выбора" },
  { code: "major-07", name: "Колесница", arcana: "major", glyph: "VII", upright: "движение к цели, собранность", reversedMeaning: "рывок без направления, усталость от контроля" },
  { code: "major-08", name: "Сила", arcana: "major", glyph: "VIII", upright: "мягкая стойкость", reversedMeaning: "самодавление, сила без нежности" },
  { code: "major-09", name: "Отшельник", arcana: "major", glyph: "IX", upright: "пауза, поиск ответа внутри", reversedMeaning: "изоляция, одиночество вместо ответа" },
  { code: "major-10", name: "Колесо Фортуны", arcana: "major", glyph: "X", upright: "перемена, новый цикл", reversedMeaning: "сопротивление перемене, повтор старого круга" },
  { code: "major-11", name: "Справедливость", arcana: "major", glyph: "XI", upright: "честность и последствия", reversedMeaning: "искажение баланса, уход от ответственности" },
  { code: "major-12", name: "Повешенный", arcana: "major", glyph: "XII", upright: "смена угла зрения", reversedMeaning: "застревание, ожидание без смысла" },
  { code: "major-13", name: "Смерть", arcana: "major", glyph: "XIII", upright: "завершение и переход", reversedMeaning: "цепляние за то, что уже ушло" },
  { code: "major-14", name: "Умеренность", arcana: "major", glyph: "XIV", upright: "баланс и мера", reversedMeaning: "перекос, отсутствие внутренней настройки" },
  { code: "major-15", name: "Дьявол", arcana: "major", glyph: "XV", upright: "привязанность, что держит", reversedMeaning: "осознание зависимости, шанс вернуть свободу" },
  { code: "major-16", name: "Башня", arcana: "major", glyph: "XVI", upright: "слом иллюзии, освобождение", reversedMeaning: "страх перемен, отсроченное признание правды" },
  { code: "major-17", name: "Звезда", arcana: "major", glyph: "XVII", upright: "надежда и восстановление", reversedMeaning: "сомнение в поддержке, потеря ориентира" },
  { code: "major-18", name: "Луна", arcana: "major", glyph: "XVIII", upright: "туман, тревога, образы", reversedMeaning: "прояснение страха, выход из самообмана" },
  { code: "major-19", name: "Солнце", arcana: "major", glyph: "XIX", upright: "свет, тепло, радость", reversedMeaning: "приглушённая радость, потребность в простоте" },
  { code: "major-20", name: "Суд", arcana: "major", glyph: "XX", upright: "пробуждение, честный итог", reversedMeaning: "самокритика, отказ услышать внутренний зов" },
  { code: "major-21", name: "Мир", arcana: "major", glyph: "XXI", upright: "целостность, завершение круга", reversedMeaning: "незавершённость, последняя деталь перед итогом" },
];

/**
 * B679 — у младшего аркана в названии стоит РОДИТЕЛЬНЫЙ падеж масти.
 *
 * Правильно «Двойка Кубков», «Король Мечей», «Туз Жезлов» — так масть названа
 * во всех русских изданиях Райдера—Уэйта. До этого имя склеивалось из
 * именительных форм (`Двойка Кубки`), и ошибка попадала всюду, где имя карты
 * показывается человеку: карта дня в кабинете и мини-аппе, утренняя рассылка,
 * расклады Таро, «Арканы судьбы».
 *
 * `suit` остаётся именительным: это НАЗВАНИЕ масти («масть: Кубки»), а падеж
 * нужен только внутри имени карты.
 */
const TAROT_MINOR_SUITS: Array<{ suit: string; suitOf: string; glyph: string; theme: string }> = [
  { suit: "Жезлы", suitOf: "Жезлов", glyph: "Ж", theme: "действие, импульс, направление" },
  { suit: "Кубки", suitOf: "Кубков", glyph: "К", theme: "чувства, связь, внутренний отклик" },
  { suit: "Мечи", suitOf: "Мечей", glyph: "М", theme: "мысль, слова, различение и конфликт" },
  { suit: "Пентакли", suitOf: "Пентаклей", glyph: "П", theme: "тело, быт, деньги и устойчивость" },
];

const TAROT_MINOR_RANKS: Array<{ rank: string; upright: string; reversedMeaning: string }> = [
  { rank: "Туз", upright: "начало энергии и новый импульс", reversedMeaning: "задержка старта, сомнение в импульсе" },
  { rank: "Двойка", upright: "выбор, баланс двух сил", reversedMeaning: "колебание, трудность удержать равновесие" },
  { rank: "Тройка", upright: "рост, первые результаты, расширение", reversedMeaning: "разрозненность, рост без согласования" },
  { rank: "Четвёрка", upright: "стабильность, пауза, опора", reversedMeaning: "застой, слишком тесная рамка" },
  { rank: "Пятёрка", upright: "напряжение, урок через конфликт", reversedMeaning: "выход из борьбы, усталость спорить" },
  { rank: "Шестёрка", upright: "восстановление, помощь, движение дальше", reversedMeaning: "застревание в прошлом, помощь не принята" },
  { rank: "Семёрка", upright: "испытание, выбор позиции, защита своего", reversedMeaning: "сомнение, перегруз защитой" },
  { rank: "Восьмёрка", upright: "движение, навык, концентрация", reversedMeaning: "спешка или повтор без смысла" },
  { rank: "Девятка", upright: "зрелость опыта, внутренняя проверка", reversedMeaning: "перенапряжение, ожидание подвоха" },
  { rank: "Десятка", upright: "итог цикла, полнота темы", reversedMeaning: "перегруз завершением, лишний груз" },
  { rank: "Паж", upright: "весть, ученик, любопытство", reversedMeaning: "незрелый сигнал, поспешные выводы" },
  { rank: "Рыцарь", upright: "движение, стремление, активный шаг", reversedMeaning: "крайность, суета или рывок без меры" },
  { rank: "Королева", upright: "зрелое принятие и внутренняя власть", reversedMeaning: "закрытость, контроль через заботу" },
  { rank: "Король", upright: "мастерство, ответственность, ясная форма", reversedMeaning: "жёсткое управление, страх потерять контроль" },
];

export const TAROT_DECK: TarotDeckCard[] = [
  ...TAROT_MAJOR_ARCANA,
  ...TAROT_MINOR_SUITS.flatMap((suit) => TAROT_MINOR_RANKS.map((rank, index) => ({
    code: `minor-${suit.glyph}-${index + 1}`,
    name: `${rank.rank} ${suit.suitOf}`,
    arcana: "minor" as const,
    suit: suit.suit,
    rank: rank.rank,
    glyph: suit.glyph,
    upright: `${rank.upright}; сфера: ${suit.theme}`,
    reversedMeaning: `${rank.reversedMeaning}; сфера: ${suit.theme}`,
  }))),
];

// Lookup deck card by its Russian name. Used to recover the `code`/`arcana` of
// LEGACY stored cards: results created before B437 stored only
// {name, meaning, position, reversed} with no `code`, which crashed the page
// when the card image path was derived (card.code.split → undefined). Matching
// by name restores the correct Rider-Waite-Smith image deterministically.
// B679: в сохранённых результатах лежат имена ОБОИХ поколений — до правки
// падежа («Двойка Кубки») и после («Двойка Кубков»). Старое имя остаётся
// синонимом: иначе у прошлых раскладов перестанет находиться код карты, и
// страница снова упадёт на выводе картинки. Синоним добавляется первым, чтобы
// правильное имя перекрыло его при совпадении.
const TAROT_CARD_BY_NAME: Map<string, TarotDeckCard> = new Map([
  ...TAROT_DECK
    .filter((card) => card.arcana === "minor" && card.rank && card.suit)
    .map((card): [string, TarotDeckCard] => [
      `${card.rank} ${card.suit}`.trim().toLowerCase(),
      card,
    ]),
  ...TAROT_DECK.map((card): [string, TarotDeckCard] => [card.name.trim().toLowerCase(), card]),
]);

export function tarotDeckCardByName(name: string | null | undefined): TarotDeckCard | null {
  if (!name) return null;
  return TAROT_CARD_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}
