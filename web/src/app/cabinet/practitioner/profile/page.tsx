export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionerSettingsClient } from "./practitioner-settings-client";
import { appUrl, loginUrl } from "@/lib/subdomain";

export default async function PractitionerProfilePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    include: {
      user: {
        select: { name: true, email: true, avatarUrl: true, telegramId: true, telegramUsername: true, password: true },
      },
    },
  });

  if (!practitioner) redirect(appUrl(""));

  // Same OAuth-vs-password detection as the client cabinet settings page.
  const pwd = practitioner.user.password;
  const hasPassword = !!pwd
    && !pwd.startsWith("oauth:")
    && !pwd.startsWith("vk:")
    && !pwd.startsWith("tg:")
    && !pwd.startsWith("telegram:");

  return (
    <PractitionerSettingsClient
      initialData={{
        name: practitioner.user.name,
        email: practitioner.user.email,
        avatarUrl: practitioner.user.avatarUrl,
        title: practitioner.title,
        bio: practitioner.bio,
        experience: practitioner.experience,
        categories: practitioner.categories,
        directions: practitioner.directions,
        specialties: practitioner.specialties as string[],
        tags: practitioner.tags,
        languages: practitioner.languages,
      }}
      practitionerId={practitioner.id}
      telegramStatus={{
        linked: !!practitioner.user.telegramId,
        username: practitioner.user.telegramUsername ?? null,
      }}
      hasPassword={hasPassword}
    />
  );
}
