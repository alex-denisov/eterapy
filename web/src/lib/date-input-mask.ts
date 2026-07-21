/**
 * B554 п.23: поля даты рождения принимали любой текст без форматирования —
 * человек набирал «111», а точки должен был ставить сам. Маска доклеивает
 * разделители по мере ввода: 1 → 1, 11 → 11., 1105 → 11.05., 11051990 →
 * 11.05.1990.
 *
 * Чистая функция без DOM: её же используют тесты и любые другие поля даты.
 */

const MAX_DIGITS = 8; // ДДММГГГГ

/**
 * Приводит ввод к виду ДД.ММ.ГГГГ.
 *
 * Удаление символов не должно драться с маской: если пользователь стёр точку,
 * мы не возвращаем её обратно на том же нажатии — поэтому при вводе, который
 * стал КОРОЧЕ предыдущего значения, завершающий разделитель не добавляется.
 */
export function maskDateInput(raw: string, previous = ""): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
  if (!digits) return "";

  const deleting = raw.length < previous.length;
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  const joined = parts.join(".");

  // Пока блок заполнен целиком и впереди есть что вводить — сразу ставим точку,
  // чтобы следующая цифра попала в новый блок без ручного разделителя.
  const needsTrailingDot = !deleting && digits.length !== MAX_DIGITS && (digits.length === 2 || digits.length === 4);
  return needsTrailingDot ? `${joined}.` : joined;
}

/**
 * Маска для СОСТАВНОГО поля вида «12.04.1992, 14:35, Москва» (натальная карта,
 * синастрия). Форматирует только ведущую дату и молчит, как только она набрана:
 * иначе `maskDateInput` утянул бы минуты и цифры в названии города внутрь даты.
 */
export function maskLeadingDateInput(raw: string, previous = ""): string {
  const separator = raw.search(/[,;]/);
  const head = separator === -1 ? raw : raw.slice(0, separator);
  const tail = separator === -1 ? "" : raw.slice(separator);

  // Голова уже не похожа на дату (человек начал с города) — не вмешиваемся.
  if (!/^[\d.\s]*$/.test(head)) return raw;
  // Дата набрана и разложена по блокам: дальше идут время и город — молчим.
  if (/^\d{2}\.\d{2}\.\d{4}/.test(head.trim())) return raw;

  const previousSeparator = previous.search(/[,;]/);
  const previousHead = previousSeparator === -1 ? previous : previous.slice(0, previousSeparator);
  return `${maskDateInput(head, previousHead)}${tail}`;
}

/** Похоже ли значение на полную дату ДД.ММ.ГГГГ с валидными днём и месяцем. */
export function isCompleteDate(value: string): boolean {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= new Date().getFullYear();
}
