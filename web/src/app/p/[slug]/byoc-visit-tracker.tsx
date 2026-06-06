"use client";

import { useEffect } from "react";

export function ByocVisitTracker({ slug, token }: { slug: string; token: string }) {
  useEffect(() => {
    const params = new URLSearchParams({ slug, ref: token });
    void fetch(`/api/practitioner/invites/visit?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
    }).catch(() => undefined);
  }, [slug, token]);

  return null;
}
