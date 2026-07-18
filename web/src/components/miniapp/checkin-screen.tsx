"use client";

import { CheckinExperience } from "@/components/dialogue/checkin-experience";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function MiniAppCheckinScreen() {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <CheckinExperience surface="miniapp" surfaceClassName={styles["dialogue-surface"]} />
    </MiniAppChrome>
  );
}
