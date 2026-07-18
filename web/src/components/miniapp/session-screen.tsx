"use client";

import { VideoRoom } from "@/components/video/video-room";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function MiniAppSessionScreen(props: React.ComponentProps<typeof VideoRoom>) {
  const { data } = useMiniAppV21();
  return <MiniAppChrome data={data}><div className={styles["miniapp-session"]}><VideoRoom {...props} exitHref="/miniapp/profile/bookings" /></div></MiniAppChrome>;
}
