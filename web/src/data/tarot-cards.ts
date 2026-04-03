export interface TarotCard {
  id: number;
  name: string;
  nameRu: string;
  arcana: "major" | "minor";
  suit?: string;
  keywords: string[];
  keywordsReversed: string[];
}

export const majorArcana: TarotCard[] = [
  { id: 0, name: "The Fool", nameRu: "Шут", arcana: "major", keywords: ["новое начало", "спонтанность", "свобода", "невинность"], keywordsReversed: ["безрассудство", "страх перемен", "наивность"] },
  { id: 1, name: "The Magician", nameRu: "Маг", arcana: "major", keywords: ["сила воли", "мастерство", "ресурсы", "действие"], keywordsReversed: ["манипуляция", "нереализованный потенциал", "хитрость"] },
  { id: 2, name: "The High Priestess", nameRu: "Верховная Жрица", arcana: "major", keywords: ["интуиция", "тайна", "внутренний голос", "мудрость"], keywordsReversed: ["игнорирование интуиции", "поверхностность", "секреты"] },
  { id: 3, name: "The Empress", nameRu: "Императрица", arcana: "major", keywords: ["изобилие", "забота", "плодородие", "красота"], keywordsReversed: ["зависимость", "гиперопека", "творческий блок"] },
  { id: 4, name: "The Emperor", nameRu: "Император", arcana: "major", keywords: ["структура", "авторитет", "стабильность", "контроль"], keywordsReversed: ["тирания", "негибкость", "потеря контроля"] },
  { id: 5, name: "The Hierophant", nameRu: "Иерофант", arcana: "major", keywords: ["традиция", "учитель", "духовность", "система"], keywordsReversed: ["догматизм", "бунт", "нонконформизм"] },
  { id: 6, name: "The Lovers", nameRu: "Влюблённые", arcana: "major", keywords: ["любовь", "выбор", "гармония", "партнёрство"], keywordsReversed: ["дисгармония", "сложный выбор", "предательство"] },
  { id: 7, name: "The Chariot", nameRu: "Колесница", arcana: "major", keywords: ["воля", "победа", "решимость", "движение"], keywordsReversed: ["потеря направления", "агрессия", "бессилие"] },
  { id: 8, name: "Strength", nameRu: "Сила", arcana: "major", keywords: ["внутренняя сила", "терпение", "мужество", "мягкость"], keywordsReversed: ["слабость", "неуверенность", "грубая сила"] },
  { id: 9, name: "The Hermit", nameRu: "Отшельник", arcana: "major", keywords: ["самопознание", "одиночество", "мудрость", "поиск"], keywordsReversed: ["изоляция", "отчуждение", "паранойя"] },
  { id: 10, name: "Wheel of Fortune", nameRu: "Колесо Фортуны", arcana: "major", keywords: ["перемены", "судьба", "цикл", "удача"], keywordsReversed: ["застой", "сопротивление переменам", "неудача"] },
  { id: 11, name: "Justice", nameRu: "Справедливость", arcana: "major", keywords: ["справедливость", "истина", "баланс", "ответственность"], keywordsReversed: ["несправедливость", "нечестность", "дисбаланс"] },
  { id: 12, name: "The Hanged Man", nameRu: "Повешенный", arcana: "major", keywords: ["пауза", "жертва", "новый взгляд", "отпускание"], keywordsReversed: ["стагнация", "бессмысленная жертва", "нерешительность"] },
  { id: 13, name: "Death", nameRu: "Смерть", arcana: "major", keywords: ["трансформация", "конец", "обновление", "отпускание"], keywordsReversed: ["сопротивление переменам", "страх", "застой"] },
  { id: 14, name: "Temperance", nameRu: "Умеренность", arcana: "major", keywords: ["баланс", "терпение", "гармония", "исцеление"], keywordsReversed: ["дисбаланс", "крайности", "нетерпение"] },
  { id: 15, name: "The Devil", nameRu: "Дьявол", arcana: "major", keywords: ["зависимость", "привязанность", "тень", "искушение"], keywordsReversed: ["освобождение", "осознание", "разрыв цепей"] },
  { id: 16, name: "The Tower", nameRu: "Башня", arcana: "major", keywords: ["разрушение", "кризис", "освобождение", "прозрение"], keywordsReversed: ["избегание катастрофы", "страх перемен", "затяжной кризис"] },
  { id: 17, name: "The Star", nameRu: "Звезда", arcana: "major", keywords: ["надежда", "вдохновение", "ясность", "обновление"], keywordsReversed: ["разочарование", "потеря веры", "пессимизм"] },
  { id: 18, name: "The Moon", nameRu: "Луна", arcana: "major", keywords: ["иллюзия", "страх", "подсознание", "интуиция"], keywordsReversed: ["ясность", "преодоление страхов", "обман раскрыт"] },
  { id: 19, name: "The Sun", nameRu: "Солнце", arcana: "major", keywords: ["радость", "успех", "витальность", "ясность"], keywordsReversed: ["задержка успеха", "ложный оптимизм", "выгорание"] },
  { id: 20, name: "Judgement", nameRu: "Суд", arcana: "major", keywords: ["пробуждение", "призвание", "обновление", "рефлексия"], keywordsReversed: ["самокритика", "сомнения", "отказ от перемен"] },
  { id: 21, name: "The World", nameRu: "Мир", arcana: "major", keywords: ["завершение", "целостность", "достижение", "интеграция"], keywordsReversed: ["незавершённость", "застой", "потеря цели"] },
];

// Для MVP используем только старшие арканы.
// Полный набор 78 карт будет добавлен в следующей итерации.
export const allCards = majorArcana;

export function drawCards(count: number): Array<TarotCard & { reversed: boolean }> {
  const shuffled = [...allCards].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((card) => ({
    ...card,
    reversed: Math.random() > 0.5,
  }));
}
