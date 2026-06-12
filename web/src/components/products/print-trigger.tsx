"use client";

import { useEffect } from "react";

// B388: открывает системный диалог печати → «Сохранить как PDF». Так PDF честно
// содержит отрисованные визуальные элементы (колесо/расклад), а не только текст,
// без новой PDF-зависимости. Авто-вызов один раз; есть и ручная кнопка.
export function PrintTrigger() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // печать недоступна — пользователь нажмёт кнопку вручную
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="soft-button soft-button-primary no-print"
      data-testid="print-pdf-button"
    >
      Сохранить как PDF
    </button>
  );
}
