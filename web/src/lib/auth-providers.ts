/**
 * Классический VK OAuth провайдер для NextAuth v5
 *
 * Приложение создаётся на vk.com/apps?act=manage → Website
 * Redirect URI: https://eterapy.com/api/auth/callback/vk
 *
 * Эндпоинты:
 * - authorize: https://oauth.vk.com/authorize
 * - token:     https://oauth.vk.com/access_token
 * - userinfo:  VK API users.get через https://api.vk.com/method/
 */

import type { OAuthConfig } from "next-auth/providers";

interface VKProfile {
  id: number;
  first_name: string;
  last_name: string;
  photo_200?: string;
  email?: string;
}

export function VK(config: { clientId: string; clientSecret: string }): OAuthConfig<VKProfile> {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback/vk`;

  return {
    id: "vk",
    name: "VK",
    type: "oauth",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    checks: ["state"] as const,
    authorization: {
      url: "https://oauth.vk.com/authorize",
      params: {
        scope: "email",
        response_type: "code",
        redirect_uri: redirectUri,
      },
    },
    token: {
      url: "https://oauth.vk.com/access_token",
    },
    userinfo: {
      url: "https://api.vk.com/method/users.get",
      async request({ tokens }: { tokens: Record<string, unknown> }) {
        const accessToken = tokens.access_token as string | undefined;
        if (!accessToken) throw new Error("No access token");
        const url = new URL("https://api.vk.com/method/users.get");
        url.searchParams.set("fields", "photo_200");
        url.searchParams.set("access_token", accessToken);
        url.searchParams.set("v", "5.199");

        const res = await fetch(url.toString());
        const data = await res.json();
        const user = data.response?.[0];

        if (!user) {
          throw new Error("VK userinfo: empty response");
        }

        // VK API возвращает email только если он был запрошен в scope
        const email = tokens.email as string | undefined;
        if (email) {
          user.email = email;
        }

        return user;
      },
    },
    profile(profile: VKProfile & { email?: string }) {
      return {
        id: String(profile.id),
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || `vk_${profile.id}`,
        email: profile.email ?? null,
        image: profile.photo_200 ?? null,
      };
    },
  };
}
