"use client";

import { useSession } from "next-auth/react";

// Issue #9: the user-side message avatar (soft-msg-avatar-user) in both the
// /checkin clarifying chat and the /products/chat companion chat is tied to the
// user's avatar from their cabinet (session.user.image — the same source the
// header pill and Settings use). Falls back to the name initial, then «В», so
// guests on /checkin keep the existing lettered avatar.
export function UserMsgAvatar() {
  const { data } = useSession();
  const image = data?.user?.image ?? null;
  const name = data?.user?.name ?? "";
  const initial = name.trim()[0]?.toUpperCase() ?? "В";

  if (image) {
    return (
      <div className="soft-msg-avatar soft-msg-avatar-user soft-msg-avatar-photo" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" referrerPolicy="no-referrer" />
      </div>
    );
  }

  return (
    <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">
      {initial}
    </div>
  );
}
