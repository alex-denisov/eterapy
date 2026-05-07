"use client";

import { useEffect } from "react";

export function ShareAttribution({ token, source, topic }: { token?: string | null; source?: string | null; topic?: string | null }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("eterapy:analytics", {
      detail: {
        event: "share_landing_viewed",
        surface: "public_share",
        source: source ?? "",
        topic: topic ?? "",
        token: token ? "present" : "missing",
      },
    }));

    if (!token) return;
    void fetch("/api/share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {
      // Attribution must never block the public question-first flow.
    });
  }, [source, token, topic]);

  return null;
}
