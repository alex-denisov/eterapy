/**
 * B764 — выгрузка вердиктов владельца по постам Threads: что заходит по моделям,
 * форматам, кластерам, приёмам и областям жизни.
 *
 * Запуск: npx tsx scripts/print-threads-verdicts.ts [дней=7]
 */

import { readThreadsVerdicts, renderVerdictReport } from "../src/lib/marketing/threads-verdicts";

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 7);
  const since = new Date(Date.now() - days * 86_400_000);
  process.stdout.write(`${renderVerdictReport(await readThreadsVerdicts(), since)}\n`);
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
