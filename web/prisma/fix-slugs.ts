/**
 * Generate slugs for existing practitioners that have 'pending' as slug.
 * Run: npx tsx prisma/fix-slugs.ts
 */
import { generateUniqueSlug } from "../src/lib/slug";
import db from "../src/lib/db";

async function main() {
  const practitioners = await db.practitioner.findMany({
    where: { OR: [{ slug: "pending" }, { slug: "" }] },
    include: { user: { select: { name: true } } },
  });

  console.log(`Found ${practitioners.length} practitioner(s) needing slug fix`);

  for (const p of practitioners) {
    const slug = await generateUniqueSlug(p.user.name, async (s) => {
      const exists = await db.practitioner.findUnique({ where: { slug: s } });
      return !!exists;
    });
    await db.practitioner.update({
      where: { id: p.id },
      data: { slug },
    });
    console.log(`  ${p.user.name} → ${slug}`);
  }

  console.log("Done.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
