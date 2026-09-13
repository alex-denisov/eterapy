/**
 * B616 — conversational registers for public replies.
 *
 * Owner decision (2026-07-29): the SMM agent must not sound like one polite
 * corporate voice on every platform. Jokes, sarcasm, irony, banter and blunt
 * disagreement are all allowed when they fit the post and the platform. What
 * stays forbidden is not a *tone* but a *harm*: attacking a person, mocking
 * someone in crisis, slurs, and anything that would get the account reported.
 *
 * The register is chosen here rather than by the model so that the mix is
 * observable, reproducible and auditable per publication.
 */

import type { EngagementPlatform } from "@/lib/marketing/engagement-plan";

export interface EngagementTone {
  id: string;
  label: string;
  brief: string;
}

const SHARED: Record<string, EngagementTone> = {
  direct: {
    id: "direct",
    label: "прямая помощь",
    brief: "Отвечай по существу и коротко, как человек, который уже проходил это. Без разогрева и без морали в конце.",
  },
  dry: {
    id: "dry",
    label: "сухая ирония",
    brief: "Сдержанный юмор через точную формулировку, а не через шутку-ярлык. Ирония направлена на ситуацию, не на автора поста.",
  },
  sarcasm: {
    id: "sarcasm",
    label: "сарказм",
    brief: "Разреши себе сарказм по поводу самой ситуации или общего места, которое все повторяют. Заканчивай чем-то полезным, иначе это просто яд.",
  },
  banter: {
    id: "banter",
    label: "подначка",
    brief: "Лёгкая дружеская подначка в сторону общего клише темы. Тон приятеля в переписке, а не остряка со сцены.",
  },
  story: {
    id: "story",
    label: "короткая история",
    brief: "Две-три фразы наблюдения из жизни вокруг, без выдуманного личного опыта и без «у меня было то же самое».",
  },
  contrarian: {
    id: "contrarian",
    label: "несогласие",
    brief: "Прямо не согласись с популярным ответом в треде и объясни, почему. Спорь с тезисом, а не с человеком.",
  },
  deadpan: {
    id: "deadpan",
    label: "невозмутимость",
    brief: "Ровный тон без эмоциональной подсветки, эффект держится на самом наблюдении. Ни одного эмодзи.",
  },
  warm: {
    id: "warm",
    label: "тёплый разговор",
    brief: "По-человечески тепло, но без сюсюканья, без «обнимаю» и без диагнозов.",
  },
};

/**
 * Per-platform rotation. Order matters: the first entries are the registers
 * that read as native on that network.
 */
const PLATFORM_TONES: Record<EngagementPlatform, readonly EngagementTone[]> = {
  vk: [SHARED.warm, SHARED.direct, SHARED.story, SHARED.dry, SHARED.banter, SHARED.contrarian],
  threads: [SHARED.dry, SHARED.sarcasm, SHARED.banter, SHARED.deadpan, SHARED.direct, SHARED.story],
};

export function engagementTonesFor(platform: EngagementPlatform): readonly EngagementTone[] {
  return PLATFORM_TONES[platform];
}

/**
 * Rotate registers so the same voice never lands twice in a row on the same
 * platform. `recentToneIds` is ordered newest-first.
 */
export function pickEngagementTone(input: {
  platform: EngagementPlatform;
  sequence: number;
  recentToneIds?: readonly string[];
}): EngagementTone {
  const tones = PLATFORM_TONES[input.platform];
  const blocked = new Set((input.recentToneIds ?? []).slice(0, 2));
  const start = ((input.sequence % tones.length) + tones.length) % tones.length;
  for (let offset = 0; offset < tones.length; offset += 1) {
    const candidate = tones[(start + offset) % tones.length];
    if (!blocked.has(candidate.id)) return candidate;
  }
  return tones[start];
}

/**
 * B618 — регистры для ответа на входящее. Человек написал нам сам, поэтому набор
 * уже: тёплый разговор, прямая помощь, наблюдение, сухая ирония. Сарказма и
 * подначки здесь нет — подначивать того, кто пришёл с вопросом, незачем.
 *
 * Площадки входящего шире, чем у поиска (добавляются Instagram и Telegram), и
 * своего списка регистров у них нет: для них берётся общий набор.
 */
const INBOUND_TONES: readonly EngagementTone[] = [
  SHARED.warm,
  SHARED.direct,
  SHARED.story,
  SHARED.dry,
  SHARED.deadpan,
];

export function pickInboundTone(input: {
  platform: string;
  sequence: number;
  recentToneIds?: readonly string[];
}): EngagementTone {
  const tones = INBOUND_TONES;
  const blocked = new Set((input.recentToneIds ?? []).slice(0, 2));
  const start = ((input.sequence % tones.length) + tones.length) % tones.length;
  for (let offset = 0; offset < tones.length; offset += 1) {
    const candidate = tones[(start + offset) % tones.length];
    if (!blocked.has(candidate.id)) return candidate;
  }
  return tones[start];
}

export function engagementToneById(id: string | null | undefined): EngagementTone | null {
  if (!id) return null;
  return SHARED[id] ?? null;
}

/**
 * The only hard floor. Everything above it — including rudeness towards an
 * idea, sarcasm and refusal to agree — is an editorial choice, not a breach.
 */
export const ENGAGEMENT_TONE_HARD_LIMITS = [
  "не переходи на личность автора поста или комментаторов: оскорбления, унижение, ярлыки о человеке запрещены",
  "не трогай национальность, религию, ориентацию, гендер, возраст, тело, диагноз и доход как повод для шутки",
  "не шути про смерть, самоповреждение, насилие, утрату и острый кризис — в таких тредах либо помощь, либо молчание",
  "не имитируй чужой личный опыт, не выдумывай истории и не выдавай себя за клиента или специалиста",
  "не устраивай травлю, не зови других в тред и не публикуй персональные данные",
  "не нарушай правила площадки и не проси голосов, подписок или репостов",
] as const;
