"use client";

import { SlotManager } from "./slot-manager";

export function SlotManagerWrapper({ practitionerId }: { practitionerId: string }) {
  return <SlotManager practitionerId={practitionerId} />;
}
