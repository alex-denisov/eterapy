/**
 * Кастомный VK ID OAuth 2.1 провайдер для NextAuth v5
 *
 * VK ID (id.vk.ru) — новый стандарт, заменяет vk.com/editapp.
 * Использует OAuth 2.1 с обязательным PKCE.
 *
 * Создание приложения:
 * 1. id.vk.ru → «Создать приложение» → Веб-приложение
 * 2. Redirect URI: https://eterapy.com/api/auth/callback/vk
 * 3. Скопировать App ID → VK_CLIENT_ID, Secure key → VK_CLIENT_SECRET
 *
 * Эндпоинты VK ID OAuth 2.1:
 * - authorize: https://id.vk.com/authorize (с PKCE)
 * - token:     https://oauth.vk.com/access_token (поддерживает code_verifier)
 * - userinfo:  https://id.vk.com/oauth2/user_info (POST, Bearer token + client_id)
 *
 * NextAuth v5 генерирует PKCE автоматически при checks: ["pkce", "state"].
 * device_id из callback VK ID не обязателен для server-side web flow.
 */

export function VK({ clientId, clientSecret }: { clientId: string; clientSecret: string }) {
  return {
    id: "vk" as const,
    name: "VK ID",
    type: "oauth" as const,
    clientId,
    clientSecret,
    checks: ["pkce", "state"] as const,
    authorization: {
      url: "https://id.vk.com/authorize",
      params: {
        scope: "email vkid.personal_info",
        response_type: "code",
      },
    },
    client: {
      token_endpoint_auth_method: "client_secret_post" as const,
    },
    token: {
      url: "https://oauth.vk.com/access_token",
    },
    userinfo: {
      url: "https://id.vk.com/oauth2/user_info",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async request({ tokens, provider }: { tokens: any; provider: any }) {
        // VK ID userinfo требует client_id в теле запроса
        const res = await fetch(provider.userinfo.url as string, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Bearer ${tokens.access_token}`,
          },
          body: new URLSearchParams({ client_id: provider.clientId }),
        });
        const data = await res.json();
        // VK ID возвращает user объект напрямую (не обёрнут в response[])
        return {
          ...data,
          email: data.email ?? tokens.email ?? null,
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile(profile: any) {
      return {
        id: String(profile.user_id ?? profile.id),
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || `vk_${profile.user_id ?? profile.id}`,
        email: profile.email ?? null,
        image: profile.avatar ?? profile.photo_200 ?? null,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any; // NextAuth v5 не имеет типизированного VK ID провайдера
}
