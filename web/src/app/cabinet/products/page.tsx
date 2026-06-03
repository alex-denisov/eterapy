import { redirect } from "next/navigation";

/**
 * X11: the cabinet «продукты» catalog duplicated /cabinet/credits (both rendered
 * v5Products with purchase controls), which split the funnel. /credits is the
 * single funnel page (it's in the nav and shows the catalog under
 * #credits-products), so this route now redirects there.
 */
export default function CabinetProductsRedirect() {
  redirect("/cabinet/credits");
}
