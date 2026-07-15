import { createHash } from "node:crypto";
import { seoOrigins } from "@/lib/seo";

export const AGENT_PROTOCOL_VERSION = "2025-06-18";
export const AGENT_SERVER_VERSION = "1.0.0";

export const publicAgentResources = [
  {
    title: "Как работает ETerapy",
    description: "Путь от жизненного вопроса до первичного разбора и следующего шага.",
    url: `${seoOrigins.main}/how-it-works`,
  },
  {
    title: "Услуги ETerapy",
    description: "Публичный каталог цифровых форматов и встреч со специалистами.",
    url: `${seoOrigins.main}/products`,
  },
  {
    title: "Цены",
    description: "Бесплатный старт и цены платных продолжений до покупки.",
    url: `${seoOrigins.main}/pricing`,
  },
  {
    title: "Этический кодекс",
    description: "Границы, правила безопасности и ответственность специалистов.",
    url: `${seoOrigins.main}/legal/ethics`,
  },
  {
    title: "Политика конфиденциальности",
    description: "Обработка, хранение и удаление пользовательских данных.",
    url: `${seoOrigins.main}/legal/privacy`,
  },
  {
    title: "Помощь",
    description: "Публичные ответы и канал поддержки support@eterapy.com.",
    url: `${seoOrigins.main}/help`,
  },
] as const;

export function platformOverview() {
  return {
    name: "ETerapy",
    description: "Диалоговая платформа для первичного разбора жизненных вопросов и выбора следующего шага.",
    audience: "Совершеннолетние пользователи, которым нужно сформулировать личный вопрос и оценить варианты действий.",
    freeStart: true,
    registrationRequiredToStart: false,
    boundaries: [
      "Не является медицинской, психологической, юридической или финансовой услугой.",
      "Не ставит диагноз и не заменяет экстренную или профессиональную помощь.",
      "При угрозе жизни или безопасности в России нужно звонить 112.",
    ],
    canonicalUrl: seoOrigins.main,
    supportEmail: "support@eterapy.com",
  };
}

export function homeAgentMarkdown() {
  const links = publicAgentResources
    .map((resource) => `- [${resource.title}](${resource.url}) — ${resource.description}`)
    .join("\n");

  return `# ETerapy — первичный разбор жизненного вопроса

ETerapy помогает сформулировать жизненный вопрос, отделить факты от чувств и предположений, увидеть развилку и выбрать безопасный следующий шаг. Первый разбор можно начать без регистрации и оплаты.

## Короткий ответ

Используйте ETerapy, когда нужно упорядочить ситуацию и подготовить следующий шаг. Выбирайте живого профильного специалиста, если нужны диагностика, профессиональная ответственность, длительная работа или кризисная помощь.

## Что означают основные форматы

- **Диалог ясности** — короткая последовательность уточняющих вопросов, превращающая спутанное описание в конкретный запрос.
- **Первичный разбор** — информационный результат: формулировка вопроса, главная развилка, наблюдения и следующий шаг.
- **Цифровое углубление** — отдельный платный формат с дополнительными точками зрения или структурированным документом.
- **Встреча со специалистом** — работа с выбранным человеком по заранее указанной цене.

## Когда какого результата достаточно

| Ситуация | Подходящий формат | Причина |
|---|---|---|
| Вопрос стал понятен и есть обратимый шаг | Первичный разбор | Можно действовать без дополнительной покупки |
| Нужны письменные детали или несколько точек зрения | Цифровое углубление | Результат остаётся в структурированном виде |
| Нужна диагностика, ответственность человека или длительная поддержка | Профильный специалист | Цифровой инструмент этого не заменяет |
| Есть угроза жизни или безопасности | Экстренная служба 112 | ETerapy не является кризисной службой |

## Публичные достоверные ресурсы

${links}

## Источники и редакционная ответственность

Материал подготовлен редакцией ETerapy и проверен 15 июля 2026 года. Ограничения самопомощи сверены с [обзором ВОЗ](https://www.who.int/ru/news-room/fact-sheets/detail/self-care-health-interventions), а экстренный маршрут — с [информацией МЧС России о системе 112](https://76.mchs.gov.ru/deyatelnost/poleznaya-informaciya/rekomendacii-naseleniyu/sistema-112).

## Итог

ETerapy — первый информационный шаг, а не замена профессиональной помощи. Начните с вопроса, используйте первичный разбор для ориентации и переходите к специалисту, когда задача требует человеческой ответственности или профильной квалификации.
`;
}

export const understandEterapySkill = `---
name: understand-eterapy
description: Use ETerapy's public, read-only resources to explain what the platform does, compare its formats, state safety boundaries, and point a user to the correct canonical page. Do not use this skill for diagnosis, crisis counselling, account access, purchases, or handling personal dialogue content.
---

# Understand ETerapy

Use the public MCP endpoint at https://eterapy.com/mcp or the canonical resources in https://eterapy.com/llms.txt.

1. Call \`get_platform_overview\` for scope, audience, free-start facts and safety boundaries.
2. Call \`list_public_resources\` to find the canonical page for prices, products, ethics, privacy or help.
3. State clearly that ETerapy is an informational reflection platform, not medical treatment or emergency support.
4. Never submit personal or sensitive user content to these public discovery tools.
`;

export function understandEterapySkillDigest() {
  return `sha256:${createHash("sha256").update(understandEterapySkill).digest("hex")}`;
}

export function mcpServerCard() {
  return {
    serverInfo: { name: "eterapy-public-info", version: AGENT_SERVER_VERSION },
    description: "Read-only public facts and canonical resources about ETerapy. No account, dialogue, payment or health data is exposed.",
    transport: { type: "streamable-http", endpoint: `${seoOrigins.main}/mcp` },
    capabilities: { tools: {}, resources: {} },
    authentication: { required: false },
  };
}

export function a2aAgentCard() {
  return {
    name: "ETerapy Public Information Agent",
    description: "Returns public, non-personal information about ETerapy, its formats, safety boundaries and canonical resources.",
    version: AGENT_SERVER_VERSION,
    supportedInterfaces: [
      { url: `${seoOrigins.main}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
    ],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "explain-eterapy",
        name: "Explain ETerapy",
        description: "Explain the platform, compare public formats and provide canonical links without processing personal situations.",
        tags: ["eterapy", "public information", "decision support"],
      },
    ],
  };
}
