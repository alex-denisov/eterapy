import { notFound } from "next/navigation";
import { MiniAppConfiguredProductFrame } from "@/components/miniapp/product-frame";
import { MiniAppProductActions } from "@/components/miniapp/product-actions";
import { getV5Product } from "@/lib/v5-products";
import { getSetting } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function MiniAppProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ resultId?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const baseProduct = getV5Product(slug);
  if (!baseProduct || baseProduct.slug === "pair") notFound();
  const configuredRubles = Number(await getSetting(`product.${baseProduct.slug}.price`));
  const configuredCredits = Number(await getSetting(`product.${baseProduct.slug}.credits`));
  const product = {
    ...baseProduct,
    ...(Number.isInteger(configuredRubles) && configuredRubles > 0 ? { price: `${configuredRubles.toLocaleString("ru-RU")} ₽` } : {}),
    ...(Number.isInteger(configuredCredits) && configuredCredits > 0 ? { creditCost: configuredCredits, creditPrice: `или −${configuredCredits} балла` } : {}),
  };
  return <MiniAppConfiguredProductFrame product={product}><MiniAppProductActions product={product} search={search} /></MiniAppConfiguredProductFrame>;
}
