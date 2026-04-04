import db from "../src/lib/db";

async function main() {
  // Upgrade existing admin to SUPERADMIN
  await db.user.upsert({
    where: { email: "admin@test.eterapy.com" },
    create: {
      id: "test-superadmin-001",
      email: "admin@test.eterapy.com",
      name: "Суперадмин ETerapy",
      password: "admin1234",
      role: "SUPERADMIN",
      emailVerified: true,
    },
    update: { role: "SUPERADMIN", name: "Суперадмин ETerapy" },
  });

  // Regular admin
  await db.user.upsert({
    where: { email: "moderator@test.eterapy.com" },
    create: {
      id: "test-admin-002",
      email: "moderator@test.eterapy.com",
      name: "Модератор ETerapy",
      password: "admin1234",
      role: "ADMIN",
      emailVerified: true,
    },
    update: { role: "ADMIN" },
  });

  console.log("✅ SUPERADMIN: admin@test.eterapy.com / admin1234");
  console.log("✅ ADMIN:      moderator@test.eterapy.com / admin1234");
}
main().catch(console.error);
