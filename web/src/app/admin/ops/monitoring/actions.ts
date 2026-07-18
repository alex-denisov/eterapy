"use server";

/**
 * B541 — server actions панели «Мониторинг флота».
 * Доступ только SUPERADMIN; каждый запуск деплоя пишется в audit_logs.
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { dispatchFleetDeploy, getFleetDispatchConfig, FleetDispatchError } from "@/lib/fleet/dispatch";
import { getFleetNodes } from "@/lib/fleet/nodes";

export type DeployActionResult = { ok: boolean; message: string };

export async function redeployFleetAction(nodeName: string | null): Promise<DeployActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || session?.user?.role !== "SUPERADMIN") {
    return { ok: false, message: "Недостаточно прав: раздел доступен только суперадмину" };
  }

  // Разрешаем деплой только на ноду из инвентаря — иначе имя ноды из формы
  // ушло бы в inputs workflow как есть.
  const nodes = getFleetNodes();
  if (nodeName && !nodes.some((node) => node.name === nodeName)) {
    return { ok: false, message: `Нода «${nodeName}» не найдена в инвентаре флота` };
  }

  const config = getFleetDispatchConfig();
  const target = nodeName ? [nodeName] : [];

  try {
    await dispatchFleetDeploy({ ...config, nodes: target });
  } catch (error) {
    const message = error instanceof FleetDispatchError ? error.message : "Не удалось запустить деплой";
    await logAudit(userId, AUDIT_ACTIONS.FLEET_DEPLOY_FAILED, nodeName ?? "all", message);
    return { ok: false, message };
  }

  await logAudit(
    userId,
    AUDIT_ACTIONS.FLEET_DEPLOY,
    nodeName ?? "all",
    `workflow=${config.workflow} ref=${config.ref}`,
  );

  revalidatePath("/admin/ops/monitoring");

  return {
    ok: true,
    message: nodeName
      ? `Редеплой ноды «${nodeName}» запущен`
      : "Редеплой всего флота запущен",
  };
}
