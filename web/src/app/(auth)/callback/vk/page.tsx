/**
 * VK ID Callback — Server Component.
 * Redirects to the API exchange endpoint, preserving query params.
 */
import { redirect } from "next/navigation";

export default async function VKCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  
  if (typeof params.code === "string") query.set("code", params.code);
  if (typeof params.device_id === "string") query.set("device_id", params.device_id);
  if (typeof params.state === "string") query.set("state", params.state);

  const qs = query.toString();
  redirect(`/api/auth/vk-exchange${qs ? `?${qs}` : ""}`);
}
