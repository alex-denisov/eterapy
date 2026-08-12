/**
 * B705 §23 — по считаемым свойствам судья машина, а не редактор.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. `draft-inspection.ts` снял с редактора работу,
 * которую делает регулярка, но снял её только на ВХОДЕ: редактор перестал
 * получать просьбу мерить длину. На ВЫХОДЕ его никто не проверял, и модель
 * продолжила мерить сама. Замер прода 2026-08-12 (материал
 * `cms5bej59002l0vwk1x54vgs8`, threads, шесть раундов): длины кандидата по
 * раундам 417, 443, 434, 501, 467, 466 при лимите 480 — и на каждом раунде
 * замечание «текст превышает лимит Threads». Последнее из них, с числом 718,
 * модель списала из НАШЕЙ записки о починке прошлого раунда: число описывало
 * состояние ДО усечения, а прочиталось как состояние сейчас.
 *
 * Убыток измерен: из 128 материалов, погибших с 05.08, 26 (20%) назвали в
 * последнем замечании редактора лимит, длину или превышение.
 *
 * ГРАНИЦА. Редактор вызывается ТОЛЬКО когда `violations` пуст — то есть длину,
 * призыв и визуальную идею машина уже посчитала и признала годными. Значит его
 * замечание об этих свойствах ложно по построению, а не по вкусу, и снимается
 * без спора о том, кто прав. Всё, чего регулярка не умеет — угол, польза, живой
 * голос, честность, безопасность, — остаётся редактору нетронутым.
 *
 * ЧТО НЕ ДЕЛАЕМ. `REJECT` не пересматриваем ни при каких замечаниях: это
 * приговор смыслу материала, а не подсчёт символов. И не вычёркиваем свойство,
 * которое машина в этом же раунде сама назвала дефектом: там редактор не
 * выдумывает, а повторяет за ней — ровно как ему велено.
 */

export interface MachineJudgedReview {
  decision: "APPROVE" | "REVISE" | "REJECT";
  scores: Record<string, number>;
  issues: string[];
  revisionBrief: string[];
  revisedText: string;
  summary: string;
}

export interface ReviewReconciliation {
  review: MachineJudgedReview;
  /** Вычеркнутые замечания — они уходят в историю раундов, а не в никуда. */
  dropped: { issue: string; family: string }[];
}

/**
 * Свойство, которое считается без понимания смысла, и ключи правил
 * `inspectDraft`, отвечающие за него.
 *
 * `pattern` намеренно требует ЛИМИТА или СЧЁТА рядом со свойством: «текст
 * длиннее лимита» — считаемое замечание, «текст длинный и водянистый» — работа
 * редактора, и путать их нельзя. Границы слов через `\b` здесь не работают:
 * в JS этот якорь не совпадает с кириллицей никогда.
 */
const MACHINE_OWNED: { family: string; rules: string[]; pattern: RegExp }[] = [
  {
    family: "length",
    rules: ["length-over", "length-under", "title-over", "paragraphs-over", "paragraph-too-long"],
    pattern: /(лимит|предел|максимум|минимум)[^.!?]{0,60}(символ|знак|текст|длин|абзац)|(символ|знак|длин|коротк|объ[её]м|абзац)[^.!?]{0,60}(лимит|предел|превыша|превыше|не уклад|больше допуст|меньше допуст|сверх)|превыша[^.!?]{0,40}(символ|знак|длин|лимит)|длиннее|короче допуст/iu,
  },
  {
    family: "hashtags",
    rules: ["hashtags-over", "hashtags-under"],
    pattern: /(хэштег|хештег|hashtag)/iu,
  },
  {
    family: "emoji",
    rules: ["emoji-over", "emoji-line-start"],
    pattern: /(эмодзи|эмоджи|смайл|emoji)/iu,
  },
  {
    family: "dash",
    rules: ["em-dash-present", "em-dash-spacing"],
    pattern: /(тире|дефис)/iu,
  },
  {
    family: "punctuation-count",
    rules: ["ellipsis-over", "exclamation-over"],
    pattern: /(многоточи|восклицательн)/iu,
  },
];

/** Оценка не может держать материал из-за дефекта, которого нет. */
const APPROVAL_SCORE = 4;

function familyOf(issue: string, machineDefectRules: readonly string[]) {
  for (const owned of MACHINE_OWNED) {
    if (!owned.pattern.test(issue)) continue;
    // Машина сама назвала этот дефект в этом раунде — редактор повторяет за
    // ней, и повтор остаётся на месте.
    if (owned.rules.some((rule) => machineDefectRules.includes(rule))) return null;
    return owned.family;
  }
  return null;
}

/**
 * Снимает с решения редактора всё, что уже посчитала машина и признала годным.
 *
 * Если после вычёркивания замечаний не осталось, возражения по существу у
 * редактора нет — материал утверждён, а просевшие оценки поднимаются до порога
 * утверждения: они просели из-за дефекта, которого не существует.
 */
export function reconcileReviewWithMachine(input: {
  review: MachineJudgedReview;
  /** Ключи правил `inspectDraft`, сработавшие на этом раунде. */
  machineDefectRules: readonly string[];
}): ReviewReconciliation {
  const { review, machineDefectRules } = input;

  // Приговор смыслу пересмотру не подлежит.
  if (review.decision === "REJECT") return { review, dropped: [] };

  const dropped: { issue: string; family: string }[] = [];
  const keptIssues: string[] = [];
  const droppedPositions: number[] = [];

  review.issues.forEach((issue, position) => {
    const family = familyOf(issue, machineDefectRules);
    if (family) {
      dropped.push({ issue, family });
      droppedPositions.push(position);
      return;
    }
    keptIssues.push(issue);
  });

  if (dropped.length === 0) return { review, dropped: [] };

  /*
   * Задание на правку идёт рядом с замечаниями: редактор пишет их одним
   * списком в одном порядке. Снимаем строку задания по позиции снятого
   * замечания, а если списки разной длины — по тому же признаку, что и
   * замечания. Разъехавшийся список задания хуже лишней строки: автор получил
   * бы поручение чинить то, чего нет.
   */
  const briefAligned = review.revisionBrief.length === review.issues.length;
  const revisionBrief = briefAligned
    ? review.revisionBrief.filter((_, position) => !droppedPositions.includes(position))
    : review.revisionBrief.filter((brief) => familyOf(brief, machineDefectRules) === null);

  if (keptIssues.length > 0) {
    return {
      review: { ...review, issues: keptIssues, revisionBrief },
      dropped,
    };
  }

  return {
    review: {
      ...review,
      decision: "APPROVE",
      issues: [],
      revisionBrief,
      summary: review.summary,
      scores: Object.fromEntries(
        Object.entries(review.scores).map(([key, score]) => [
          key,
          Number(score) < APPROVAL_SCORE ? APPROVAL_SCORE : Number(score),
        ]),
      ),
    },
    dropped,
  };
}
