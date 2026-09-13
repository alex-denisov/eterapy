/**
 * B743 — «однотипные» это не про слова, а про форму.
 *
 * ⚠ ЖАЛОБА ВЛАДЕЛЬЦА 2026-09-13: «в Дзене много статей повторяющихся,
 * одинаковых и однотипных, это мне очень не нравится». Три слова — и это три
 * РАЗНЫЕ болезни, из которых контур лечил только первую:
 *
 *   • «повторяющиеся» — одна тема в нескольких слотах. Лечится с B686/B718
 *     запретом повтора темы; у Дзена он вечный, у быстрых лент — окном.
 *   • «одинаковые» — разная тема, тот же текст кусками. Мера есть с B741
 *     (пересечение по шинглам), но стояла ТОЛЬКО на страницах Библиотеки.
 *   • «однотипные» — разная тема, разные слова, ОДНА И ТА ЖЕ ФОРМА: тот же
 *     заход, та же длина, тот же ритм абзацев, тот же способ закончить. Этого
 *     не ловит ни запрет темы, ни пересечение слов, и именно это читается как
 *     «будто сухой блог ведётся везде».
 *
 * ⚠ ПОЧЕМУ ПРОСЬБЫ В ПРОМТЕ НЕ ХВАТИЛО, ХОТЯ ОНА ТАМ БЫЛА. Системный промт
 * автора требует дословно: «Не повторяй у недавних материалов ETerapy ни хук,
 * ни композицию, ни метафору». Требование правильное, но невыполнимое:
 * недавние материалы доезжают до автора полем `recentOwnMaterials`, где тело
 * обрезано до СТА символов. Сто символов статьи Дзена — это первое
 * предложение. Композицию и метафору в них не видно, то есть автора просили
 * не повторять то, чего ему не показали.
 *
 * Отсюда две правки, и обе обязательны по отдельности: показать форму (это
 * делает `shapeDigest`, он уходит автору вместо обрезанного тела) и ИЗМЕРИТЬ
 * её (это делает `samenessFindings`). Просьбу нельзя проверить, результат —
 * можно; тот же урок, что с русским абзацем отчёта.
 */

import { containment, shingleSet } from "@/lib/seo/uniqueness";
import type { LimitViolation } from "@/lib/marketing/platform-limits";

/**
 * Доля совпадения с недавним материалом, после которой это уже не «та же
 * тема другими словами», а тот же текст.
 *
 * Порог мягче библиотечного (0.2): у поста площадки есть обязательные общие
 * куски — призыв, подпись, название продукта, — и требовать от них
 * непохожести значило бы браковать материал за собственный бренд.
 */
export const MAX_MATERIAL_OVERLAP = 0.32;

/**
 * Сколько последних материалов площадки могут делить одну форму, прежде чем
 * это станет замечанием.
 *
 * Два — это ещё совпадение: у площадки есть свой регистр, и два поста подряд,
 * начатых вопросом, читаются нормально. Три — уже узнаваемый шаблон, и
 * читатель видит не материал, а его форму.
 */
export const MAX_SAME_SHAPE_IN_ROW = 2;

export interface MaterialShape {
  /** Чем открывается текст: первые слова в нормализованном виде. */
  opening: string;
  /** Сколько абзацев. */
  paragraphs: number;
  /** Открывается ли вопросом. */
  opensWithQuestion: boolean;
  /** Заканчивается ли вопросом. */
  endsWithQuestion: boolean;
  /** Есть ли подзаголовки. */
  hasSubheadings: boolean;
}

function paragraphsOf(text: string): string[] {
  return text.split(/\n{2,}|\r\n{2,}/).map((value) => value.trim()).filter(Boolean);
}

function normalized(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function materialShape(text: string): MaterialShape {
  const blocks = paragraphsOf(text);
  const first = blocks[0] ?? "";
  const last = blocks.at(-1) ?? "";
  return {
    // Шесть слов — столько нужно, чтобы отличить заход «Вы замечали, что…» от
    // «Однажды клиентка сказала…», и мало, чтобы совпадение было случайным.
    opening: normalized(first).split(" ").slice(0, 6).join(" "),
    paragraphs: blocks.length,
    opensWithQuestion: /\?/.test(first.split(/(?<=[.!?])\s/)[0] ?? ""),
    endsWithQuestion: last.trimEnd().endsWith("?"),
    hasSubheadings: /^#{1,6}\s|\n#{1,6}\s|<h[1-6]/i.test(text),
  };
}

/**
 * Отпечаток формы для сравнения.
 *
 * ⚠ ЗАХОД В ОТПЕЧАТОК НЕ ВХОДИТ, И ЭТО НАМЕРЕННО. Два материала, начатых
 * разными словами, но одинаково устроенных, — это ровно то, на что жалуется
 * владелец. Включи мы заход, любая смена первого слова объявляла бы форму
 * новой, и мера перестала бы что-либо значить.
 */
export function shapeFingerprint(shape: MaterialShape): string {
  // Число абзацев огрубляется: 7 и 8 абзацев — это одна форма, а 3 и 9 — разные.
  const bucket = shape.paragraphs <= 3 ? "s" : shape.paragraphs <= 7 ? "m" : "l";
  return [
    bucket,
    shape.opensWithQuestion ? "q" : "-",
    shape.endsWithQuestion ? "q" : "-",
    shape.hasSubheadings ? "h" : "-",
  ].join("");
}

/**
 * Сжатое описание недавнего материала для автора.
 *
 * ⚠ ЭТО НЕ УРЕЗАННЫЙ ТЕКСТ, А ОПИСАНИЕ ФОРМЫ. Показывать автору длинную статью
 * целиком нельзя (промт вырастет вчетверо и подорожает), а сто символов,
 * которые он получал, не отвечают на вопрос «как этот материал устроен».
 * Поэтому едет структура: чем открыт, сколько абзацев, чем закончен, о чём
 * каждый абзац первой фразой.
 */
export function shapeDigest(text: string, maxBlocks = 6): {
  opening: string;
  paragraphs: number;
  endsWithQuestion: boolean;
  outline: string[];
} {
  const blocks = paragraphsOf(text);
  return {
    opening: (blocks[0] ?? "").slice(0, 160),
    paragraphs: blocks.length,
    endsWithQuestion: (blocks.at(-1) ?? "").trimEnd().endsWith("?"),
    outline: blocks.slice(0, maxBlocks).map((block) => {
      const sentence = block.split(/(?<=[.!?])\s/)[0] ?? block;
      return sentence.slice(0, 90);
    }),
  };
}

export interface RecentMaterial {
  title: string;
  text: string;
}

/**
 * Замечания об одинаковости и однотипности — в том же виде, в каком их
 * формулирует редактор.
 *
 * ⚠ ЗАМЕЧАНИЕ, А НЕ ЗАПРЕТ ВЫПУСКА. Гейт, который убивает материал, уже стоил
 * контуру 27 смертей за две недели (B713): круги редактуры кончались, и текст
 * умирал вместо того, чтобы выйти поправленным. Поэтому находка едет редактору
 * как уже посчитанная машиной, автор правит её в следующем раунде, и если
 * раунды кончились — материал выходит с отметкой «вышло с замечаниями», а не
 * молча исчезает.
 */
export function samenessFindings(input: {
  text: string;
  recent: readonly RecentMaterial[];
}): LimitViolation[] {
  const findings: LimitViolation[] = [];
  const text = input.text.trim();
  if (!text || input.recent.length === 0) return findings;

  const candidate = shingleSet(text);
  if (candidate.size > 0) {
    let worst = { title: "", value: 0 };
    for (const material of input.recent) {
      const value = containment(candidate, shingleSet(material.text));
      if (value > worst.value) worst = { title: material.title, value };
    }
    if (worst.value > MAX_MATERIAL_OVERLAP) {
      findings.push({
        kind: "contract",
        rule: "sameness-overlap",
        issue: `Текст повторяет недавний материал «${worst.title}» на `
          + `${Math.round(worst.value * 100)} % пятисловных последовательностей.`,
        brief: "Перепиши совпадающие куски своими словами: возьми другой пример, другой "
          + "поворот, другую метафору. Совпадать имеют право только призыв и название продукта.",
      });
    }
  }

  const fingerprint = shapeFingerprint(materialShape(text));
  const sameShape = input.recent.filter(
    (material) => shapeFingerprint(materialShape(material.text)) === fingerprint,
  );
  if (sameShape.length >= MAX_SAME_SHAPE_IN_ROW) {
    findings.push({
      kind: "contract",
      rule: "sameness-shape",
      issue: `Материал устроен так же, как ${sameShape.length} недавних: тот же объём, `
        + "тот же способ открыть и закончить. Читатель видит не материал, а шаблон.",
      brief: "Смени ФОРМУ, а не слова: если недавние открывались вопросом — начни со сцены "
        + "или факта; если заканчивались вопросом — закончи выводом; поменяй число и длину "
        + "абзацев. Тема и польза остаются прежними.",
    });
  }

  return findings;
}
