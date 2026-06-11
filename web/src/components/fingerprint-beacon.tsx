"use client";

// B372 (M26): однократно вычисляет лёгкий отпечаток браузера (sha-256 от
// UA + таймзоны + языка + экрана + canvas-рендера) и кладёт в cookie
// `eterapy_fp`. Без внешних сервисов и без PII — только характеристики
// устройства. Используется сервером для гостевого лимита и антифрод-логов.

import { useEffect } from "react";
import { CLIENT_FINGERPRINT_COOKIE, isValidClientFingerprint } from "@/lib/guest-fingerprint";

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function canvasSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "15px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(110, 1, 70, 22);
    ctx.fillStyle = "#069";
    ctx.fillText("ETerapy fp ✦ 2026", 2, 16);
    ctx.strokeStyle = "rgba(120, 60, 30, 0.6)";
    ctx.beginPath();
    ctx.arc(40, 22, 14, 0, Math.PI * 1.5);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return "canvas-error";
  }
}

async function computeFingerprint(): Promise<string | null> {
  if (!crypto?.subtle) return null;
  const parts = [
    navigator.userAgent,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "tz-unknown",
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    canvasSignal(),
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function FingerprintBeacon() {
  useEffect(() => {
    if (isValidClientFingerprint(readCookie(CLIENT_FINGERPRINT_COOKIE))) return;
    void computeFingerprint().then((fp) => {
      if (!fp) return;
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${CLIENT_FINGERPRINT_COOKIE}=${fp}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
    });
  }, []);

  return null;
}
