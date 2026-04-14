/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encode as jwtEncode } from "next-auth/jwt";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userDataB64 = url.searchParams.get("user_data");
  const callbackUrl = url.searchParams.get("callbackUrl") || "/cabinet";

  if (!userDataB64) {
    return NextResponse.redirect(new URL("/api/auth/error?error=NoUserData", url.origin));
  }

  let userData: any;
  try {
    userData = JSON.parse(Buffer.from(userDataB64, "base64").toString());
  } catch {
    return NextResponse.redirect(new URL("/api/auth/error?error=InvalidUserData", url.origin));
  }

  let dbUser = await db.user.findUnique({ where: { email: userData.email } });

  if (!dbUser && userData.email) {
    dbUser = await db.user.create({
      data: {
        email: userData.email,
        name: userData.name,
        password: `oauth:vk:${Date.now()}`,
        role: "CLIENT",
        emailVerified: true,
        avatarUrl: userData.image,
      },
    });
    await logAudit(dbUser.id, "REGISTER", undefined, "OAuth: vk");
  } else if (!dbUser) {
    return NextResponse.redirect(new URL("/api/auth/error?error=NoEmail", url.origin));
  } else if (dbUser.blockedAt) {
    return NextResponse.redirect(new URL("/api/auth/error?error=Blocked", url.origin));
  }

  if (!dbUser.avatarUrl && userData.image) {
    await db.user.update({ where: { id: dbUser.id }, data: { avatarUrl: userData.image } });
  }

  await logAudit(dbUser.id, "LOGIN", undefined, "OAuth: vk");

  const cookieName = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

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
    salt: cookieName,
    maxAge: 60 * 60 * 24 * 30,
  });

  const response = NextResponse.redirect(new URL(callbackUrl, url.origin));
  response.cookies.set({
    name: cookieName,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: process.env.NODE_ENV === "production" ? ".eterapy.com" : undefined,
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
