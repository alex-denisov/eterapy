import { redirect } from "next/navigation";

// B565: экран «Коротко о главном» был четырьмя статическими строками и одним
// `mailto:` — владелец справедливо назвал это заглушками. База знаний теперь
// живёт на `/miniapp/faq`, поддержка — на `/miniapp/support`. Маршрут остаётся
// живым: на него ведут старые ссылки и внешние переходы.
export default function MiniAppHelpPage() {
  redirect("/miniapp/faq");
}
