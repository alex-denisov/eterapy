export type LoginProvider = "google" | "vk" | "telegram" | "apple";

type LoginAccessUser = {
  password?: string | null;
  provider?: string | null;
  providerId?: string | null;
  telegramId?: string | null;
};

const OAUTH_PASSWORD_PREFIXES = ["oauth:", "vk:", "tg:", "telegram:"];
const SOCIAL_PROVIDERS = new Set<LoginProvider>(["google", "vk", "telegram", "apple"]);

export function hasPasswordLogin(password: string | null | undefined): boolean {
  if (!password) return false;
  return !OAUTH_PASSWORD_PREFIXES.some((prefix) => password.startsWith(prefix));
}

export function linkedLoginProviders(user: LoginAccessUser): LoginProvider[] {
  const providers: LoginProvider[] = [];
  const provider = (user.provider ?? "").toLowerCase();
  if (SOCIAL_PROVIDERS.has(provider as LoginProvider) && user.providerId) {
    providers.push(provider as LoginProvider);
  }
  if (user.telegramId) providers.push("telegram");
  return Array.from(new Set(providers));
}

export function canUnlinkLoginProvider(user: LoginAccessUser, provider: LoginProvider): { allowed: true } | { allowed: false; reason: "not_linked" | "last_login_method" } {
  const linked = linkedLoginProviders(user);
  if (!linked.includes(provider)) return { allowed: false, reason: "not_linked" };
  const remainingProviders = linked.filter((item) => item !== provider);
  if (hasPasswordLogin(user.password) || remainingProviders.length > 0) return { allowed: true };
  return { allowed: false, reason: "last_login_method" };
}
