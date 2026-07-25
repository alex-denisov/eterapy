/**
 * B577 agent entry point.
 * Usage: npm run marketing:register-publication -- ./publication.json --agent codex
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import db from "../src/lib/db";
import { upsertExternalPublicationFromCode } from "../src/lib/external-publications";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const manifestArg = process.argv.slice(2).find((value) => !value.startsWith("--") && value !== argument("--agent"));
  if (!manifestArg) throw new Error("Передайте путь к JSON-манифесту публикации");
  const agent = argument("--agent") ?? "publication-script";
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const payload = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const publication = await upsertExternalPublicationFromCode(payload, agent);
  process.stdout.write(JSON.stringify({ id: publication.id, key: publication.key, status: publication.status }) + "\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Не удалось зарегистрировать публикацию"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
