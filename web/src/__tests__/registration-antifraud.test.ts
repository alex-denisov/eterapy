/**
 * INC-064 — registration risk scoring against the real production abuse
 * pattern (random mixed-case names + Gmail dot-abuse), plus false-positive
 * guards for real Cyrillic/Latin names.
 */
import {
  caseTransitions,
  gmailDotAbuseCount,
  isDisposableEmail,
  looksMachineGeneratedName,
  scoreRegistration,
  REGISTRATION_BLOCK_THRESHOLD,
} from "@/lib/registration-antifraud";

describe("machine-generated name detection", () => {
  it("flags the observed production bot names", () => {
    for (const name of ["mNXYgzyDaOTXpdpMVn", "lVwYfQCJzEmRgiJHIm", "aEpatvJAmHShHCjfQr", "NYjEEDCpFFjjfCTqeI"]) {
      expect(looksMachineGeneratedName(name)).toBe(true);
    }
  });

  it("does not flag real human names", () => {
    for (const name of [
      "Алексей Денисов", "Кирилл Гарбуз", "Владислав Бурмистров",
      "Kirill Garbuz", "Kate Cherrydwen", "Александр", "Ivan", "Anna-Maria",
      "Иван", "María",
    ]) {
      expect(looksMachineGeneratedName(name)).toBe(false);
    }
  });

  it("counts case transitions", () => {
    expect(caseTransitions("abc")).toBe(0);
    expect(caseTransitions("aBcD")).toBe(3);
    expect(caseTransitions("Ivan")).toBe(1);
  });
});

describe("email signals", () => {
  it("counts gmail dot-abuse only for gmail/googlemail", () => {
    expect(gmailDotAbuseCount("al.e.xzh.ou.3.9.9.9@gmail.com")).toBe(7);
    expect(gmailDotAbuseCount("p.a.mcm.a.y@gmail.com")).toBe(4);
    expect(gmailDotAbuseCount("john.smith@gmail.com")).toBe(1);
    expect(gmailDotAbuseCount("first.last@company.com")).toBe(0); // not gmail
    expect(gmailDotAbuseCount("clean@yahoo.com")).toBe(0);
  });

  it("detects disposable domains", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
  });
});

describe("scoreRegistration", () => {
  it("blocks a gibberish name + heavy gmail dot-abuse", () => {
    const r = scoreRegistration({ name: "lVwYfQCJzEmRgiJHIm", email: "al.e.xzh.ou.3.9.9.9@gmail.com" });
    expect(r.score).toBeGreaterThanOrEqual(REGISTRATION_BLOCK_THRESHOLD);
    expect(r.block).toBe(true);
    expect(r.flags).toEqual(expect.arrayContaining(["machine_generated_name", "gmail_dot_abuse_heavy"]));
  });

  it("blocks a disposable-email + alias-duplicate signup", () => {
    const r = scoreRegistration({ name: "Иван", email: "x@mailinator.com", aliasDuplicate: true });
    expect(r.block).toBe(true);
  });

  it("flags but does not block a gibberish name on a clean domain", () => {
    const r = scoreRegistration({ name: "mNXYgzyDaOTXpdpMVn", email: "klm5_1@yahoo.com" });
    expect(r.flags).toContain("machine_generated_name");
    expect(r.block).toBe(false);
  });

  it("passes a normal signup with an empty flag set", () => {
    const r = scoreRegistration({ name: "Алексей Денисов", email: "alexey@example.com" });
    expect(r.score).toBe(0);
    expect(r.flags).toHaveLength(0);
    expect(r.block).toBe(false);
  });
});
