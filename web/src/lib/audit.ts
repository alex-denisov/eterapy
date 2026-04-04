import db from "./db";

export async function logAudit(params: {
  userId: string;
  targetId?: string;
  action: string;
  details?: Record<string, unknown>;
  ip?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        targetId: params.targetId ?? null,
        action: params.action,
        details: params.details ? JSON.stringify(params.details) : null,
        ip: params.ip ?? null,
      },
    });
  } catch { /* non-blocking */ }
}

export const AUDIT_ACTIONS = {
  LOGIN:            "LOGIN",
  LOGOUT:           "LOGOUT",
  PASSWORD_RESET:   "PASSWORD_RESET",
  PASSWORD_CHANGE:  "PASSWORD_CHANGE",
  PASSWORD_SET:     "PASSWORD_SET",
  PROFILE_UPDATE:   "PROFILE_UPDATE",
  AVATAR_ADD:       "AVATAR_ADD",
  AVATAR_REMOVE:    "AVATAR_REMOVE",
  ACCOUNT_BLOCK:    "ACCOUNT_BLOCK",
  ACCOUNT_UNBLOCK:  "ACCOUNT_UNBLOCK",
  ACCOUNT_DELETE:   "ACCOUNT_DELETE",
  EMAIL_VERIFY:     "EMAIL_VERIFY",
  BOOKING_CREATE:   "BOOKING_CREATE",
  BOOKING_CANCEL:   "BOOKING_CANCEL",
  BOOKING_CONFIRM:  "BOOKING_CONFIRM",
  PAYMENT:          "PAYMENT",
  SETTINGS_CHANGE:  "SETTINGS_CHANGE",
  IMPERSONATE:      "IMPERSONATE",
  PRACTITIONER_CREATE: "PRACTITIONER_CREATE",
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];
