import db from "./db";

export async function logAudit(
  userId: string,
  action: string,
  targetId?: string,
  details?: string,
  ip?: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        targetId: targetId ?? null,
        action,
        details: details ?? null,
        ip: ip ?? null,
      },
    });
  } catch { /* non-blocking */ }
}

export const AUDIT_ACTIONS = {
  REGISTER:            "REGISTER",
  LOGIN:               "LOGIN",
  LOGOUT:              "LOGOUT",
  PASSWORD_RESET:      "PASSWORD_RESET",
  PASSWORD_CHANGE:     "PASSWORD_CHANGE",
  PASSWORD_SET:        "PASSWORD_SET",
  PROFILE_UPDATE:      "PROFILE_UPDATE",
  AVATAR_ADD:          "AVATAR_ADD",
  AVATAR_REMOVE:       "AVATAR_REMOVE",
  ACCOUNT_BLOCK:       "ACCOUNT_BLOCK",
  ACCOUNT_UNBLOCK:     "ACCOUNT_UNBLOCK",
  ACCOUNT_DELETE:      "ACCOUNT_DELETE",
  EMAIL_VERIFY:        "EMAIL_VERIFY",
  BOOKING_CREATE:      "BOOKING_CREATE",
  BOOKING_CANCEL:      "BOOKING_CANCEL",
  BOOKING_CONFIRM:     "BOOKING_CONFIRM",
  PAYMENT:             "PAYMENT",
  CARD_LINKED:         "CARD_LINKED",
  CARD_REMOVED:        "CARD_REMOVED",
  SETTINGS_CHANGE:     "SETTINGS_CHANGE",
  IMPERSONATE:         "IMPERSONATE",
  PRACTITIONER_CREATE: "PRACTITIONER_CREATE",
  PRACTITIONER_STATUS: "PRACTITIONER_STATUS",
  PRACTITIONER_PROFILE_UPDATE: "PRACTITIONER_PROFILE_UPDATE",
  DIALOGUE_SUPPORT_VIEW: "DIALOGUE_SUPPORT_VIEW",
  FLEET_DEPLOY:        "FLEET_DEPLOY",
  FLEET_DEPLOY_FAILED: "FLEET_DEPLOY_FAILED",
  EXTERNAL_PUBLICATION_CREATE: "EXTERNAL_PUBLICATION_CREATE",
  EXTERNAL_PUBLICATION_UPDATE: "EXTERNAL_PUBLICATION_UPDATE",
  EXTERNAL_PUBLICATION_METRIC: "EXTERNAL_PUBLICATION_METRIC",
  MARKETING_AGENT_STATE: "MARKETING_AGENT_STATE",
  MARKETING_AGENT_RUN: "MARKETING_AGENT_RUN",
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];
