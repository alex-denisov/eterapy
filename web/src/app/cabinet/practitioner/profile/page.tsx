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

  if (!practitioner) redirect(appUrl(""));

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="soft-eyebrow">Профиль практика</div>
      <h1 className="soft-h1 mt-2 mb-2">Мой профиль</h1>
      <p className="text-sm mb-6" style={{ color: "var(--soft-ink-soft)" }}>
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
