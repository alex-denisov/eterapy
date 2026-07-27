import { permanentRedirect } from "next/navigation";

// B306 → B593 → B605: /cabinet/modalities вёл на /cabinet/practice. С B605
// /cabinet/practice удалён совсем, так что этот редирект — единственное, что
// ещё держит старый адрес живым, и ведёт он прямо на «Дневник», где ритуал и
// живёт. Сам по себе он ничего не стоит; удалять его вместе с /practice
// владелец не просил.
export default function LegacyCabinetModalitiesRedirect() {
  permanentRedirect("/cabinet/diary");
}
