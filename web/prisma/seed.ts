import { usersDb } from "../src/lib/users-db";

async function main() {
  console.log("🌱 Seeding test accounts...");
  await usersDb.seedTestAccounts();
  console.log("✅ Done");
}

main().catch(console.error);
