import { redirect } from "next/navigation";
import { adminUrl } from "@/lib/subdomain";

export type SessionRole = string | null | undefined;

/**
 * Y6 — role-based access control for the client cabinet.
 *
 * The `/cabinet/*` tree mixes client-only surfaces (credits, billing, questions,
 * action-history, practice, map) with the practitioner area (`/cabinet/practitioner/*`).
 * The practitioner pages already redirect non-practitioners, but the client pages
 * historically gated only on "is logged in", so a PRACTITIONER (or admin) could open
 * a client surface like `/cabinet/credits` by direct link.
 *
 * `guardClientCabinet` enforces "this surface belongs to CLIENT accounts": it sends
 * practitioners to their own home and admins/moderators to the admin subdomain. This
 * is an authorization control (deny + route to the caller's real home), not a legacy
 * URL alias — a direct link can no longer render a surface the role is not entitled to.
 *
 * Call it in a Server Component AFTER the session/login check. For Client Components
 * use the role from `useSession()` and redirect with the router instead.
 */
export function guardClientCabinet(role: SessionRole): void {
  if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
  if (role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR") {
    redirect(adminUrl("/admin"));
  }
}
