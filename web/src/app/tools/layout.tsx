import { auth } from "@/lib/auth";
import { ToolsLayoutClient } from "./tools-layout-client";

export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const user = session?.user ?? null;

  return (
    <ToolsLayoutClient role={role} user={user}>
      {children}
    </ToolsLayoutClient>
  );
}
