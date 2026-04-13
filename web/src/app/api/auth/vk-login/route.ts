/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encode as jwtEncode } from "next-auth/jwt";

interface VKTokenData {
  access_token: string;
  user_id: number | string;
  email?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { access_token, user_id, code, code_verifier, device_id } = body as {
      access_token?: string;
      user_id?: number | string;
      code?: string;
      code_verifier?: string;
      device_id?: string;
      email?: string;
    };
    if (!access_token && !code) {
      return NextResponse.json({ error: "No access_token or code" }, { status: 400 });
    }

    // Если пришёл code (redirect flow) — обмениваем сами
    let tokenData: VKTokenData = { access_token: access_token ?? "", user_id: user_id ?? 0, email: body.email as string | undefined };
    if (code && code_verifier) {
      try {
        const tokenParams = new URLSearchParams();
        tokenParams.set("grant_type", "authorization_code");
        tokenParams.set("code", code);
        tokenParams.set("redirect_uri", "https://eterapy.com/callback/vk");
        tokenParams.set("client_id", process.env.VK_CLIENT_ID!);
        tokenParams.set("client_secret", process.env.VK_CLIENT_SECRET!);
        tokenParams.set("code_verifier", code_verifier);
        if (device_id) tokenParams.set("device_id", device_id);

        console.log("[VK] Exchanging code for token...");
        const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenParams,
        });
        const data = await tokenRes.json();
        if (!tokenRes.ok || data.error) {
          console.error("[VK] Token exchange error:", JSON.stringify(data, null, 2));
          return NextResponse.json({ error: data.error_description || data.error || "Token exchange failed" }, { status: 400 });
        }
        tokenData = data as VKTokenData;
        console.log("[VK] Token received, user_id:", data.user_id);
      } catch (err: unknown) {
        console.error("[VK] Token exchange exception:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: "Token exchange failed: " + message }, { status: 500 });
      }
    }

    let email: string | undefined = tokenData.email;
    const userId = tokenData.user_id || user_id;

    console.log("[VK] tokenData.email:", tokenData.email);

    // Получаем email если не пришёл
    if (!email && userId) {
      try {
        const form = new URLSearchParams();
        form.set("access_token", tokenData.access_token);
        form.set("v", "5.199");
        form.set("user_ids", String(userId));
        form.set("fields", "email");
        const res = await fetch("https://api.vk.com/method/users.get", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        });
        const data = await res.json();
        email = data.response?.[0]?.email;
        console.log("[VK] users.get email:", email || "(not found)");
      } catch { /* ignore */ }
    }

    // userinfo через VK ID
    if (!email) {
      try {
        const res = await fetch("https://id.vk.com/oauth2/user_info", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${tokenData.access_token}`,
          },
          body: new URLSearchParams({ client_id: process.env.VK_CLIENT_ID! }),
        });
        const data = await res.json();
        email = data.email || data.user?.email;
        console.log("[VK] userinfo email:", email || "(not found)");
      } catch { /* ignore */ }
    }

    if (!email && userId) {
      email = `vk${userId}@vk.id`;
      console.log("[VK] ⚠️ Using placeholder email:", email);
    }

    if (!email) {
      return NextResponse.json({ error: "VK не вернул email" }, { status: 400 });
    }

    // Получаем профиль через VK API
    let firstName = body.first_name as string | undefined;
    let lastName = body.last_name as string | undefined;
    let birthDateStr = body.birthday as string | undefined;
    let avatarUrl = body.avatar as string | undefined;

    if (userId && (!firstName || !lastName)) {
      try {
        const form = new URLSearchParams();
        form.set("access_token", tokenData.access_token);
        form.set("v", "5.199");
        form.set("user_ids", String(userId));
        form.set("fields", "first_name,last_name,bdate,photo_200");
        const res = await fetch("https://api.vk.com/method/users.get", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        });
        const data = await res.json();
        const vkUser = data.response?.[0];
        if (vkUser) {
          if (!firstName) firstName = vkUser.first_name;
          if (!lastName) lastName = vkUser.last_name;
          if (!birthDateStr) birthDateStr = vkUser.bdate;
          if (!avatarUrl) avatarUrl = vkUser.photo_200;
        }
        console.log("[VK] users.get profile:", JSON.stringify(vkUser));
      } catch { /* ignore */ }
    }

    const name = `${firstName || ""} ${lastName || ""}`.trim() || `VK User ${userId || ""}`;

    // Находим или создаём пользователя
    let dbUser = await db.user.findUnique({ where: { email } });

    if (!dbUser) {
      const createData: any = {
        email,
        name,
        password: `oauth:vk:${Date.now()}`,
        role: "CLIENT",
        emailVerified: true,
        provider: "vk",
        providerId: String(userId),
      };
      if (avatarUrl) createData.avatarUrl = avatarUrl;
      if (birthDateStr) {
        try {
          const parts = birthDateStr.split(".");
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            createData.birthDate = new Date(Date.UTC(year, month, day, 23, 59, 59));
          }
        } catch { /* ignore */ }
      }
      dbUser = await db.user.create({ data: createData });
      await logAudit(dbUser.id, "REGISTER", undefined, "OAuth: vk");
    } else if (dbUser.blockedAt) {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    } else {
      const updateData: any = {};
      if (name && dbUser.name !== name) updateData.name = name;
      if (avatarUrl && !dbUser.avatarUrl) updateData.avatarUrl = avatarUrl;
      if (birthDateStr && !dbUser.birthDate) {
        try {
          const parts = birthDateStr.split(".");
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            updateData.birthDate = new Date(Date.UTC(year, month, day, 23, 59, 59));
          }
        } catch { /* ignore */ }
      }
      if (Object.keys(updateData).length > 0) {
        await db.user.update({ where: { id: dbUser.id }, data: updateData });
      }
    }

    await logAudit(dbUser.id, "LOGIN", undefined, "OAuth: vk");

    console.log("[VK Login] User:", JSON.stringify({
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      birthDate: dbUser.birthDate,
      avatarUrl: dbUser.avatarUrl,
    }));

    const token = await jwtEncode({
      token: {
        name: dbUser.name,
        email: dbUser.email,
        picture: dbUser.avatarUrl,
        sub: dbUser.id,
        id: dbUser.id,
        emailVerified: dbUser.emailVerified,
        role: dbUser.role,
      },
      secret: process.env.AUTH_SECRET!,
      salt: "__Secure-authjs.session-token",
      maxAge: 60 * 60 * 24 * 30,
    });

    const response = NextResponse.json({ success: true, redirect: "/cabinet" });
    response.cookies.set({
      name: "__Secure-authjs.session-token",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err: any) {
    console.error("[VK Login] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
