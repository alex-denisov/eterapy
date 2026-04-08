/**
 * Валидация даты рождения в формате DD.MM.YYYY
 * Возвращает null если дата валидна, или строку с ошибкой.
 */
export function validateBirthDate(dateStr: string): string | null {
  if (!dateStr) return null; // пустое значение допустимо

  // Удаляем все не-цифры и проверяем формат
  const digits = dateStr.replace(/\D/g, "");

  // Ожидаем 8 цифр (DDMMYYYY)
  if (digits.length !== 8) {
    return "Введите полную дату";
  }

  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);

  const currentYear = new Date().getFullYear();

  if (year < 1900 || year > currentYear) {
    return `Год должен быть от 1900 до ${currentYear}`;
  }

  if (month < 1 || month > 12) {
    return "Месяц должен быть от 01 до 12";
  }

  if (day < 1) {
    return "День должен быть от 01";
  }

  // Проверяем количество дней в месяце
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    return `В ${getMonthName(month)} ${year} года ${daysInMonth} дней`;
  }

  // Проверка на будущую дату
  const inputDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (inputDate > today) {
    return "Дата рождения не может быть в будущем";
  }

  return null;
}

function getMonthName(month: number): string {
  const names = [
    "январе", "феврале", "марте", "апреле", "мае", "июне",
    "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"
  ];
  return names[month - 1];
}

/**
 * Конвертирует строку DD.MM.YYYY в YYYY-MM-DD (для отправки на сервер)
 */
export function formatDateForServer(dateStr: string): string | null {
  if (!dateStr) return null;
  const digits = dateStr.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}
