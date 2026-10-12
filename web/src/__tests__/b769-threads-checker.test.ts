/** B769 — цитата-доказательство проверяется кодом: без неё флаг не засчитывается. */
import { checkerVerdict, parseCheckerResponse, verifiedCheckerFlags } from "@/lib/marketing/threads-checker";

const POST = "Бывший лайкнул фото в 2 ночи.\nЯ сразу скинула скрин трём подругам.";

describe("проверка цитат проверяющего", () => {
  it("флаг с настоящей цитатой засчитывается, с выдуманной — нет", () => {
    const response = parseCheckerResponse(JSON.stringify({
      q1_bookish: { flag: true, quote: "скинула скрин", why: "жаргон" },
      q3_broken_link: { flag: true, quote: "фраза которой нет в посте", why: "разрыв" },
      q4_unclear: { flag: true, quote: null, why: "непонятно" },
    }));
    const flags = verifiedCheckerFlags(POST, response);
    expect(flags.q1_bookish).toBe(true);
    expect(flags.q3_broken_link).toBe(false);
    expect(flags.q4_unclear).toBe(false);
  });

  it("регистр, ё и пробелы в цитате не мешают; слишком короткая цитата не доказательство", () => {
    const flags = verifiedCheckerFlags("Она ждёт ответа", parseCheckerResponse('{"q1_bookish":{"flag":true,"quote":"  ЖДЕТ  ответа "},"q2_impossible":{"flag":true,"quote":"ее"}}'));
    expect(flags.q1_bookish).toBe(true);
    expect(flags.q2_impossible).toBe(false);
  });

  it("мусор вместо JSON даёт null и ни одного флага", () => {
    expect(parseCheckerResponse("не json")).toBeNull();
    expect(parseCheckerResponse(null)).toBeNull();
    const flags = verifiedCheckerFlags(POST, null);
    expect(Object.values(flags).every((value) => !value)).toBe(true);
  });

  it("вердикт считает только точные вопросы по умолчанию", () => {
    const flags = verifiedCheckerFlags(POST, parseCheckerResponse('{"q5_no_sting":{"flag":true,"quote":"скинула скрин"}}'));
    expect(checkerVerdict(flags).flagged).toBe(false);
    expect(checkerVerdict(flags, ["q5_no_sting"]).flagged).toBe(true);
  });
});
