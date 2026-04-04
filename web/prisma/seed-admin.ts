import db from "../src/lib/db";
import { Role } from "@prisma/client";

async function main() {
  await db.user.upsert({
    where: { email: "admin@test.eterapy.com" },
    create: {
      id: "test-admin-001",
      email: "admin@test.eterapy.com",
      name: "Администратор ETerapy",
      password: "admin1234",
      role: Role.ADMIN,
      emailVerified: true,
    },
    update: { role: Role.ADMIN, emailVerified: true },
  });
  console.log("✅ Admin account ready: admin@test.eterapy.com / admin1234");
}
main().catch(console.error);
