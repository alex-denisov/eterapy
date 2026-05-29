import { redirect } from "next/navigation";

// T3: the product metrics now live inside the Обзор business-monitoring center
// (web/src/app/admin/deep-metrics.tsx). This standalone page is retired and
// redirects to the unified overview.
export default function AdminMetricsPage() {
  redirect("/admin");
}
