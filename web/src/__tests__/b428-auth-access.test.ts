import { canUnlinkLoginProvider, hasPasswordLogin, linkedLoginProviders } from "@/lib/auth-access";

describe("B428 auth access methods", () => {
  it("blocks unlinking the last login provider when no password is set", () => {
    const user = {
      password: "oauth:vk:1781780000",
      provider: "vk",
      providerId: "vk-1",
      telegramId: null,
    };

    expect(hasPasswordLogin(user.password)).toBe(false);
    expect(linkedLoginProviders(user)).toEqual(["vk"]);
    expect(canUnlinkLoginProvider(user, "vk")).toEqual({
      allowed: false,
      reason: "last_login_method",
    });
  });
});
