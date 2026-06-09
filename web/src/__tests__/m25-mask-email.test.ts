import fs from "node:fs";
import path from "node:path";
import { maskEmail, roleLabelRu } from "@/lib/mask-email";

// B359 / Баг 17 — «кому» recipient display in /admin/notifications.

describe("maskEmail", () => {
  it("masks the local part but keeps first/last char + domain", () => {
    expect(maskEmail("elena.petrova@mail.ru")).toBe("e****a@mail.ru");
    expect(maskEmail("john@example.com")).toBe("j**n@example.com");
  });

  it("handles short local parts without revealing them", () => {
    expect(maskEmail("ab@x.io")).toBe("a*@x.io");
    expect(maskEmail("a@x.io")).toBe("a*@x.io");
  });

  it("returns a dash for empty or malformed input", () => {
    expect(maskEmail(null)).toBe("—");
    expect(maskEmail(undefined)).toBe("—");
    expect(maskEmail("")).toBe("—");
    expect(maskEmail("not-an-email")).toBe("—");
    expect(maskEmail("@nolocal.com")).toBe("—");
    expect(maskEmail("nodomain@")).toBe("—");
  });

  it("never returns the full local part", () => {
    const masked = maskEmail("verylonglocalpart@domain.com");
    expect(masked).toContain("@domain.com");
    expect(masked).not.toContain("verylonglocalpart");
    expect(masked.split("@")[0]).toContain("*");
  });
});

describe("roleLabelRu", () => {
  it("maps roles to Russian labels", () => {
    expect(roleLabelRu("PRACTITIONER")).toBe("Практик");
    expect(roleLabelRu("CLIENT")).toBe("Клиент");
    expect(roleLabelRu("SUPERADMIN")).toBe("Суперадмин");
  });
  it("falls back to the raw role / dash", () => {
    expect(roleLabelRu("UNKNOWN")).toBe("UNKNOWN");
    expect(roleLabelRu(null)).toBe("—");
  });
});

describe("B359/Баг17 wiring", () => {
  it("admin notifications page renders a «Кому» column from resolved recipients", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/admin/notifications/page.tsx"),
      "utf8",
    );
    expect(page).toContain("maskEmail");
    expect(page).toContain("Кому");
    expect(page).toContain("recipientLabel");
    // colspan kept in sync with the new column count
    expect(page).toContain("colSpan={10}");
  });
});
