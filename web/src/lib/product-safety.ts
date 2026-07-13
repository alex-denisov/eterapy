import { classifyDialogueSafety, shouldInterruptDialogue, type DialogueSafetyResult } from "@/lib/dialogue-safety";
import { log } from "@/lib/logger";

export const PRODUCT_CRISIS_MESSAGE = "Похоже, сейчас важнее не символический разбор, а живая срочная поддержка. ETerapy не является экстренной службой. Если есть риск для вашей безопасности или безопасности другого человека, обратитесь в местные экстренные службы или к близкому человеку прямо сейчас. В России можно позвонить 112.";

export const PRODUCT_BLOCKED_MESSAGE = "Этот запрос нельзя продолжить в формате разбора. Я не могу помогать с причинением вреда, преследованием, принуждением, мошенничеством или обходом правил. Можно переформулировать вопрос вокруг вашей безопасности, границ или следующего законного шага.";

export type ProductSafetyDecision = DialogueSafetyResult & {
  interrupted: boolean;
  message: string | null;
};

export async function classifyProductSafety(input: {
  text: string;
  productKey: string;
  userId: string;
  requestId: string;
}): Promise<ProductSafetyDecision> {
  const result = await classifyDialogueSafety({
    question: input.text,
    userId: input.userId,
    requestId: input.requestId,
  });
  const interrupted = shouldInterruptDialogue(result.level);
  if (interrupted) {
    log.warn("symbolic-product-safety-interrupted", {
      requestId: input.requestId,
      productKey: input.productKey,
      level: result.level,
      reason: result.reason,
      source: result.source,
    });
  }
  return {
    ...result,
    interrupted,
    message: result.level === "crisis"
      ? PRODUCT_CRISIS_MESSAGE
      : result.level === "blocked"
        ? PRODUCT_BLOCKED_MESSAGE
        : null,
  };
}
