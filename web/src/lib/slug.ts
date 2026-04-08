/**
 * Transliterate Cyrillic to Latin for URL slugs.
 * "Анна Иванова" → "anna-ivanova"
 */
const CYRILLIC_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(char => CYRILLIC_MAP[char] ?? char)
    .join('');
}

function toSlug(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique slug for a practitioner.
 * If "Anna Ivanova" exists → "anna-ivanova-2", etc.
 */
export async function generateUniqueSlug(
  name: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = toSlug(name);
  if (!base) return 'practitioner-' + Date.now().toString(36);

  // Try base slug
  if (!(await checkExists(base))) return base;

  // Try with incrementing suffix
  for (let i = 2; i < 1000; i++) {
    const slug = `${base}-${i}`;
    if (!(await checkExists(slug))) return slug;
  }

  // Fallback
  return `${base}-${Date.now().toString(36)}`;
}
