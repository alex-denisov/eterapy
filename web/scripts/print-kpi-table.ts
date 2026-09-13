/**
 * B743 — печать контракта KPI.
 *
 * Сам рендер живёт в `src/lib/marketing/kpi-doc.ts`: его проверяет прогон, а
 * файл назначения лежит в `docs/`, которого в репозитории нет (B340 —
 * публичный репозиторий держит только продукт).
 *
 * Запуск: npm run kpi:table > ../docs/board/kpi.md
 */

import { renderKpiTable } from "../src/lib/marketing/kpi-doc";

process.stdout.write(renderKpiTable());
