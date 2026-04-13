export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function PractitionerReviewsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const avg = practitioner.reviewCount > 0
    ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1)
    : null;

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="font-heading text-2xl font-bold">Отзывы</h1>
        {avg && (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-1">
            <span className="text-primary font-bold">{avg}</span>
            <span className="text-primary">★</span>
            <span className="text-xs text-muted-foreground">{practitioner.reviewCount} отзывов</span>
          </div>
        )}
      </div>

      {practitioner.reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">Пока нет отзывов. Они появятся после завершённых сессий.</p>
      ) : (
        <div className="space-y-4">
          {practitioner.reviews.map((r) => (
            <Card key={r.id} className="border-border/40 bg-card/30">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{r.author?.name ?? "Клиент"}</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className={i < r.rating ? "text-primary" : "text-muted-foreground/30"}>★</span>
                    ))}
                  </div>
                </div>
                {r.text && <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>}
                <p className="mt-2 text-xs text-muted-foreground/60">
                  {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
