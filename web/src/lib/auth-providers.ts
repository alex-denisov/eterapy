/**
 * Кастомный VK OAuth провайдер для NextAuth v5
 *
 * Создание приложения VK:
 * 1. vk.com/editapp?act=create → Веб-сайт
 * 2. Адрес сайта: https://eterapy.com
 * 3. Базовый домен: eterapy.com
 * 4. Redirect URI (добавить оба):
 *    - https://eterapy.com/api/auth/callback/vk
 *    - http://localhost:3000/api/auth/callback/vk
 * 5. Скопировать App ID → VK_CLIENT_ID, Защищённый ключ → VK_CLIENT_SECRET
 */

export function VK({ clientId, clientSecret }: { clientId: string; clientSecret: string }) {
  return {
    id: "vk" as const,
    name: "VK",
    type: "oauth" as const,
    clientId,
    clientSecret,
    authorization: {
      url: "https://oauth.vk.com/authorize",
      params: {
        scope: "email",
        display: "popup",
        v: "5.131",
        response_type: "code",
      },
    },
    token: {
      url: "https://oauth.vk.com/access_token",
    },
    userinfo: {
      url: "https://api.vk.com/method/users.get",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async request({ tokens, provider }: { tokens: any; provider: any }) {
        const url = new URL(provider.userinfo.url as string);
        url.searchParams.set("fields", "photo_200");
        url.searchParams.set("v", "5.131");
        url.searchParams.set("access_token", tokens.access_token as string);
        const res = await fetch(url.toString());
        const data = await res.json();
        const user = data.response?.[0] ?? {};
        return { ...user, email: tokens.email ?? null };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile(profile: any) {
      return {
        id: String(profile.id),
        name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || `vk_${profile.id}`,
        email: profile.email ?? null,
        image: profile.photo_200 ?? null,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any; // NextAuth v5 doesn't have a typed VK provider — cast to any
}
