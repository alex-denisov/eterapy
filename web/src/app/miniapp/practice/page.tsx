import { permanentRedirect } from "next/navigation";

/** B593: тот же вывод, что и в вебе — ритуал живёт на «Дневнике». */
export default function RetiredMiniAppPracticeRedirect() {
  permanentRedirect("/miniapp/diary");
}
