import { permanentRedirect } from "next/navigation";

// B306 → B593: /cabinet/modalities вёл на /cabinet/practice, а тот с B593 сам
// стал переадресацией. Двойной прыжок ничего не даёт — старый URL ведёт сразу
// на «Дневник», где ритуал и живёт.
export default function LegacyCabinetModalitiesRedirect() {
  permanentRedirect("/cabinet/diary");
}
