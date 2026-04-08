/**
 * Date input with year validation (1900 - current year).
 * Prevents manual entry of invalid years.
 */
"use client";

import { forwardRef } from "react";

interface ValidatedDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onChange: (value: string) => void;
  error?: string;
}

export const ValidatedDateInput = forwardRef<HTMLInputElement, ValidatedDateInputProps>(
  ({ onChange, error, value, className, ...rest }, ref) => {
    const currentYear = new Date().getFullYear();
    const minDate = "1900-01-01";
    const maxDate = `${currentYear}-12-31`;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) {
        onChange("");
        return;
      }
      const year = parseInt(val.split("-")[0], 10);
      if (year < 1900 || year > currentYear) {
        // Don't update value, keep the last valid value
        return;
      }
      onChange(val);
    };

    return (
      <div>
        <input
          ref={ref}
          type="date"
          value={value}
          onChange={handleChange}
          min={minDate}
          max={maxDate}
          className={className}
          {...rest}
        />
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }
);

ValidatedDateInput.displayName = "ValidatedDateInput";
