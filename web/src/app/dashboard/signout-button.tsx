"use client";

import { Button } from "@/components/ui/button";
import { logoutUrl } from "@/lib/subdomain";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={() => { window.location.href = logoutUrl(); }}
    >
      Выйти
    </Button>
  );
}
