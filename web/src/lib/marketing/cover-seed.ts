/**
 * Детерминированный выбор для обложек.
 *
 * Одна картинка на всех нодах и между перезапусками: ключ слота — единственный
 * источник «случайности». Вынесено отдельным модулем, потому что этим считают
 * и мотив графики (`cover-art`), и содержимое переписки (`chat-thread`), а
 * вторая копия хеша означала бы две разные картинки на одном ключе.
 */

/** Небольшой стабильный хеш — тот же на всех нодах и между перезапусками. */
export function hash(value: string): number {
  let out = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

/** Детерминированное число из ключа и «соли» — разные соли дают разные оси. */
export function pick(seed: string, salt: string, max: number): number {
  return hash(`${seed}#${salt}`) % Math.max(1, max);
}

/** Детерминированный элемент списка. */
export function pickOne<T>(seed: string, salt: string, list: readonly T[]): T {
  return list[pick(seed, salt, list.length)];
}
