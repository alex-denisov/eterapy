import { miniAppLibrary } from "@/lib/miniapp/journey-data";
import { LibraryScreen } from "@/components/miniapp/journey-screens";

export default function MiniAppLibraryPage() {
  return <LibraryScreen entries={miniAppLibrary()} />;
}
