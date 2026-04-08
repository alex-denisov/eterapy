/**
 * Strict date input with full validation:
 * - Year: 1900 - current year (dynamic)
 * - Month: 01-12
 * - Day: valid for the given month/year (handles leap years)
 * - Uses the same Input styling as the rest of the app
 */
"use client";

import { Input } from "@/components/ui/input";
import { forwardRef, useCallback } from "react";

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

interface StrictDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onChange: (value: string) => void;
}

export const StrictDateInput = forwardRef<HTMLInputElement, StrictDateInputProps>(
  ({ onChange, value, className, ...rest }, ref) => {
    const currentYear = new Date().getFullYear();

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw) {
        onChange("");
        return;
      }
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      if (isValidDate(year, month, day)) {
        onChange(raw);
      }
    }, [onChange]);

    return (
      <Input
        ref={ref}
        type="date"
        value={value ?? ""}
        onChange={handleChange}
        min={`1900-01-01`}
        max={`${currentYear}-12-31`}
        className={className}
        {...rest}
      />
    );
  }
);

StrictDateInput.displayName = "StrictDateInput";
