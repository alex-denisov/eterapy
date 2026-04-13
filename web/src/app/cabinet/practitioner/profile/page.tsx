export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionerProfileEditor } from "./profile-editor";

export default async function PractitionerProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    include: { user: { select: { name: true, email: true, avatarUrl: true } } },
  });

  if (!practitioner) redirect("/cabinet");

  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Мой профиль</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Информация видна клиентам в каталоге и на вашей странице.
      </p>
      <PractitionerProfileEditor
        initialData={{
          name: practitioner.user.name,
          email: practitioner.user.email,
          avatarUrl: practitioner.user.avatarUrl,
          title: practitioner.title,
          bio: practitioner.bio,
          experience: practitioner.experience,
          specialties: practitioner.specialties as string[],
          tags: practitioner.tags,
          languages: practitioner.languages,
        }}
        practitionerId={practitioner.id}
      />
    </div>
  );
}
