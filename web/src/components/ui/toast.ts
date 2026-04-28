"use client";

import { toast } from "sonner";

type ToastKind = "success" | "error" | "info" | "warning";

const toastIcons: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
  warning: "!",
};

export function showToast(kind: ToastKind, message: string, description?: string) {
  return toast(message, {
    description,
    icon: toastIcons[kind],
    className: `eterapy-toast eterapy-toast-${kind}`,
  });
}

export const v5Toast = {
  success: (message: string, description?: string) => showToast("success", message, description),
  error: (message: string, description?: string) => showToast("error", message, description),
  info: (message: string, description?: string) => showToast("info", message, description),
  warning: (message: string, description?: string) => showToast("warning", message, description),
};
