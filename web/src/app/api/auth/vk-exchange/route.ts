/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encode as jwtEncode } from "next-auth/jwt";

const APP_URL = process.env.NEXTAUTH_URL || "https://eterapy.com";

/**
 * VK ID Token Exchange endpoint (GET).
 * VK redirects to /callback/vk which redirects here via meta refresh.
 * URL has ?code=...&device_id=...
 * We read code_verifier from a cookie set by the VK button.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const deviceId = url.searchParams.get("device_id");

  if (!code) {
    return NextResponse.redirect(new URL("/login", APP_URL));
  }

  // Read code_verifier from cookie (set by VKIDButton)
  const codeVerifier = request.cookies.get("vk_code_verifier")?.value || "";
  console.log("[VK] code:", code ? `${code.slice(0, 20)}...` : "MISSING");
  console.log("[VK] device_id:", deviceId || "MISSING");
  console.log("[VK] code_verifier from cookie:", codeVerifier ? `${codeVerifier.slice(0, 20)}...` : "MISSING");

  try {
    // Exchange code for token
    const tokenParams = new URLSearchParams();
    tokenParams.set("grant_type", "authorization_code");
    tokenParams.set("code", code);
    tokenParams.set("redirect_uri", "https://eterapy.com/callback/vk");
    tokenParams.set("client_id", process.env.VK_CLIENT_ID!);
    tokenParams.set("client_secret", process.env.VK_CLIENT_SECRET!);
    if (codeVerifier) tokenParams.set("code_verifier", codeVerifier);
    if (deviceId) tokenParams.set("device_id", deviceId);

    console.log("[VK] Exchanging code for token...");
    const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("[VK] Token error:", JSON.stringify(tokenData, null, 2));
      return NextResponse.redirect(new URL("/login?error=vk_token_error", APP_URL));
    }

    console.log("[VK] Token received, user_id:", tokenData.user_id);

    // Get email
    let email: string | undefined = tokenData.email;
    const userId = tokenData.user_id;

    if (!email && userId) {
      try {
        const form = new URLSearchParams();
        form.set("access_token", tokenData.access_token);
        form.set("v", "5.199");
        form.set("user_ids", userId);
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
    }

    if (!email) {
      return NextResponse.redirect(new URL("/login?error=vk_no_email", APP_URL));
    }

    // Get profile info
    let firstName: string | undefined;
    let lastName: string | undefined;
    let birthDateStr: string | undefined;
    let avatarUrl: string | undefined;

    if (userId) {
      try {
        const form = new URLSearchParams();
        form.set("access_token", tokenData.access_token);
        form.set("v", "5.199");
        form.set("user_ids", userId);
        form.set("fields", "first_name,last_name,bdate,photo_200");
        const res = await fetch("https://api.vk.com/method/users.get", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        });
        const data = await res.json();
        const vkUser = data.response?.[0];
        if (vkUser) {
          firstName = vkUser.first_name;
          lastName = vkUser.last_name;
          birthDateStr = vkUser.bdate;
          avatarUrl = vkUser.photo_200;
        }
      } catch { /* ignore */ }
    }

    const name = `${firstName || ""} ${lastName || ""}`.trim() || `VK User ${userId || ""}`;

    // Find or create user
    let dbUser = await db.user.findUnique({ where: { email } });

    if (!dbUser) {
      const createData: any = {
        email,
        name,
        password: `oauth:vk:${Date.now()}`,
        role: "CLIENT",
        emailVerified: true,
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
      return NextResponse.redirect(new URL("/login?error=blocked", APP_URL));
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

    // Create session cookie
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

    const response = NextResponse.redirect(new URL("/cabinet", APP_URL));
    response.cookies.set({
      name: "__Secure-authjs.session-token",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // Clean up code_verifier cookie
    response.cookies.set("vk_code_verifier", "", { maxAge: 0, path: "/", secure: true });

    return response;
  } catch (err: any) {
    console.error("[VK] Exchange error:", err);
    return NextResponse.redirect(new URL("/login?error=vk_error", APP_URL));
  }
}
