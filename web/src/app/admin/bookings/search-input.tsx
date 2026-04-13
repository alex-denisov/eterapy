"use client";

import { Input } from "@/components/ui/input";

export function SearchInput({ defaultValue, statusFilter }: { defaultValue: string; statusFilter: string }) {
  return (
    <Input placeholder="Поиск по имени..."
      defaultValue={defaultValue}
      className="bg-card/50 max-w-xs h-8 text-sm"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const val = (e.target as HTMLInputElement).value;
          window.location.href = `/admin/bookings?${new URLSearchParams({ status: statusFilter, search: val })}`;
        }
      }}
    />
  );
}
