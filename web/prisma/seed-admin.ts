import db from "../src/lib/db";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const password = await bcrypt.hash("admin1234", 10);
  await db.user.upsert({
    where: { email: "admin@test.eterapy.com" },
    create: {
      id: "test-admin-001",
      email: "admin@test.eterapy.com",
      name: "Администратор ETerapy",
      password,
      role: Role.ADMIN,
      emailVerified: true,
    },
    update: { role: Role.ADMIN, emailVerified: true, password },
  });
  console.log("✅ Admin account ready: admin@test.eterapy.com");
}
main().catch(console.error);
