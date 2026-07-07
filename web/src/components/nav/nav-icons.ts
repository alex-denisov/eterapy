import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CircleHelp,
  Compass,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  LibraryBig,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Sparkles,
  Sun,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import type { NavIconKey } from "@/lib/nav-model";

// B464 IB0 — maps the pure nav-model icon keys to real lucide components,
// keeping lucide out of the testable data layer (lib/nav-model.ts).
export const NAV_ICONS: Record<NavIconKey, React.ElementType> = {
  home: LayoutDashboard,
  question: MessageCircle,
  services: Sparkles,
  specialists: Users,
  diary: BookOpen,
  more: MoreHorizontal,
  wallet: Wallet,
  bookings: CalendarDays,
  invite: Gift,
  settings: Settings,
  // B464 round-4 #17: same question-mark glyph as the header help icon.
  support: CircleHelp,
  login: LogIn,
  back: ArrowLeft,
  logout: LogOut,
  library: LibraryBig,
  how: Compass,
  pricing: Tag,
  // B466 — practitioner «Practice cockpit» tabs.
  today: Sun,
  clients: Users,
  calendar: CalendarDays,
  finance: Wallet,
  grid: LayoutGrid,
  // B478 — клиентские «Сообщения» (материалы от специалиста).
  messages: Mail,
};
