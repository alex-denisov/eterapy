export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionerProfileEditor } from "./profile-editor";
import { appUrl, loginUrl } from "@/lib/subdomain";

export default async function PractitionerProfilePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    include: { user: { select: { name: true, email: true, avatarUrl: true } } },
  });

  if (!practitioner) redirect(appUrl("/cabinet"));

  return (
    <div className="max-w-3xl px-4 py-8 sm:px-6">
      <p className="premium-eyebrow">Профиль практика</p>
      <h1 className="premium-title mt-2 mb-2 text-3xl md:text-5xl">Мой профиль</h1>
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
