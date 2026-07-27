import { HOME_CONTENT_REVIEWED_AT, HOME_FAQS } from "@/lib/home-authority-content";
import { seoOrigins } from "@/lib/seo";

function link(path: string, label: string, description: string) {
  return `- [${label}](${seoOrigins.main}${path}): ${description}`;
}

export function llmsText() {
  return [
    "# ETerapy",
    "",
    "> ETerapy is a Russian-language dialogue platform for clarity in real-life questions. A visitor starts with a question, receives a free primary reflection, and may then choose a digital deepening or a verified live practitioner.",
    "",
    "ETerapy provides informational reflection, not diagnosis, treatment, psychotherapy, legal advice, financial advice, prediction, or emergency assistance. The user keeps decision authority.",
    "",
    "## Start here",
    "",
    link("/", "ETerapy overview", "Definitions, use cases, limitations, examples, sources, and frequently asked questions."),
    link("/how-it-works", "How ETerapy works", "The question-first flow from a free primary reflection to optional depth."),
    link("/products", "Products and services", "Digital formats, joint formats, symbolic reflection tools, and specialist sessions."),
    link("/ai-psychologist", "AI-assisted first reflection", "Free question-first reflection with explicit non-medical boundaries."),
    link("/products/chat-analysis", "Conversation analysis", "Private analysis of observable message tone and possible replies; no mind-reading or lie detection."),
    link("/products/tarot", "Online Tarot spread", "A question-led symbolic spread with card meanings, a decision fork, and no prediction claim."),
    link("/products/natal-chart", "Natal chart", "A chart calculated from birth data and explained as a symbolic portrait, not a forecast."),
    link("/products/compatibility-by-date", "Birth-date compatibility and synastry", "Two-chart comparison focused on relationship dynamics rather than a love score."),
    link("/products/numerology", "Matrix of Destiny", "A reproducible 22-energy calculation with non-fatalistic interpretation."),
    link("/practitioners", "Verified practitioners", "Public profiles, visible prices, formats, and booking paths."),
    "",
    "## Trust, safety, and policy",
    "",
    link("/about", "About ETerapy", "Purpose, principles, and the boundary between reflection and professional help."),
    link("/legal/ethics", "Ethical code", "Rules for practitioner conduct, safety, boundaries, and complaints."),
    link("/legal/privacy", "Privacy policy", "Data collection, storage, user controls, and deletion."),
    link("/legal/offer", "Public offer", "Service, payment, refund, and responsibility terms."),
    link("/help", "Help and FAQ", "Operational answers for clients and practitioners."),
    "",
    "## Machine-readable resources",
    "",
    link("/sitemap.xml", "XML sitemap", "Canonical public URLs."),
    link("/pricing.md", "Machine-readable pricing", "Current public digital-product prices, credit costs, result definitions, and limits."),
    link("/llms-full.txt", "Full LLM context", "Expanded product definitions, decision rules, FAQ, and source policy."),
    "",
    `Last reviewed: ${HOME_CONTENT_REVIEWED_AT}`,
    "Primary language: ru-RU",
    "Canonical origin: https://eterapy.com",
    "",
  ].join("\n");
}

export function llmsFullText() {
  const faq = HOME_FAQS.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]);
  return [
    llmsText().trimEnd(),
    "",
    "## Product model",
    "",
    "1. The visitor writes a concrete life question in free form.",
    "2. A short dialogue clarifies context, facts, feelings, assumptions, and the desired outcome.",
    "3. The free primary reflection restates the question, identifies the main decision fork, and suggests one safe next step.",
    "4. Optional paid depth includes multiple perspectives, a detailed report, conversation analysis, compatibility, a guided route, or a live practitioner.",
    "5. Meaningful results can be saved in the authenticated ETerapy cabinet.",
    "",
    "## Definitions",
    "",
    "- Dialogue of Clarity: a short clarifying exchange that turns an unstructured situation into a concrete question.",
    "- Primary reflection: a standalone informational result with a reformulation, decision fork, observations, and a next step.",
    "- Digital deepening: an optional paid written or interactive format that explores more angles or a specific source such as a conversation.",
    "- Practitioner: a live person with a public profile and visible price who may be selected when human professional depth is useful.",
    "",
    "## Decision rules",
    "",
    "Use the primary reflection when the goal is to formulate a question or identify a reversible next step. Use a digital deepening when a structured written artifact is useful. Choose a qualified human when the issue requires diagnosis, professional responsibility, sustained support, crisis response, or regulated medical, legal, or financial advice.",
    "",
    "Symbolic formats are presented as metaphors for reflection, not as facts, forecasts, diagnoses, or guarantees. ETerapy does not decide for the user.",
    "",
    "## Frequently asked questions",
    "",
    ...faq,
    "## Source and citation policy",
    "",
    "Product facts are sourced from ETerapy's public product, pricing, ethics, privacy, and offer pages. Health and self-care boundaries refer to the World Health Organization. Emergency guidance for Russia refers to the official 112 information published by EMERCOM of Russia. ETerapy does not publish invented outcomes, testimonials, practitioner credentials, or medical claims.",
    "",
    "External references:",
    "- https://www.who.int/ru/news-room/fact-sheets/detail/self-care-health-interventions",
    "- https://76.mchs.gov.ru/deyatelnost/poleznaya-informaciya/rekomendacii-naseleniyu/sistema-112",
    "",
  ].join("\n");
}
