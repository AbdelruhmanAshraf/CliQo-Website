import { getCatalogProducts } from "@/lib/catalog";
import { designsForProduct } from "@/lib/catalog-designs";
import { getDesignStock } from "@/lib/design-stock";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getCopy } from "@/i18n/server";
import { AdminShell } from "../admin-shell";
import { DesignLibrary } from "./design-library";
import { CatalogManager } from "./product-manager";
import "./products.css";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const { staff } = await requireStaff(["owner"]);
  const products = await getCatalogProducts(true);
  const [physicalStock, stockRowsResult] = await Promise.all([
    getDesignStock(products.map((product) => product.familyKey)),
    getDb().query<{ family_key: string; available: number; ready_skus: number }>(
      "select f.family_key,coalesce(sum(greatest(coalesce(b.on_hand,0)-coalesce(b.reserved,0),0)) " +
      "filter(where s.state='ready' and s.price_approved and s.sample_approved and s.fulfillment_approved),0)::int as available," +
      "count(s.id) filter(where s.state='ready' and s.price_approved and s.sample_approved and s.fulfillment_approved)::int as ready_skus " +
      "from public.product_families f left join public.product_skus s on s.product_family_id=f.id " +
      "left join public.inventory_balances b on b.sku_id=s.id group by f.family_key"),
  ]);
  const stock = Object.fromEntries(stockRowsResult.rows.map((row) => [row.family_key, { available: row.available, readySkus: row.ready_skus }]));
  const activeProducts = products.filter((product) => !product.deleted);
  const designs = activeProducts.flatMap((product) => designsForProduct(product).map((design) => ({
    familyKey: product.familyKey,
    familyNameAr: product.name,
    familyNameEn: product.nameEn,
    designId: design.id,
    designNameAr: design.nameAr,
    designNameEn: design.nameEn,
    categoryAr: design.categoryAr,
    categoryEn: design.categoryEn,
    available: physicalStock.filter((row) => row.familyKey === product.familyKey && row.face === design.face && row.variant === design.variant)
      .reduce((sum, row) => sum + row.available, 0),
    image: design.images[0]?.src ?? product.images[0] ?? "/products/mockups/stand-studio-v1.webp",
    href: "/cliqo-control/products/" + product.slug + "/" + design.id,
  })));

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className="ops-content products-admin-page">
      <div className="ops-heading"><div><p className="ops-eyebrow">{pick("المتجر", "Store")}</p><h1>{pick("المنتجات", "Products")} <span className="count-pill">{products.filter((product) => !product.deleted).length}</span></h1><p>{pick("التصاميم والأسعار والمواصفات في قائمة واحدة واضحة.", "Designs, pricing and specifications in one concise library.")}</p></div></div>
      <DesignLibrary items={designs} />
      <details className="catalog-management-details">
        <summary><span><strong>{pick("إدارة الفئات والمنتجات", "Manage categories and products")}</strong><small>{pick("إضافة منتج جديد، اختيار فئة أو كتابة فئة جديدة، وتعديل المحتوى.", "Add a product, choose an existing category or create a new one, and edit its content.")}</small></span><b aria-hidden="true">＋</b></summary>
        <CatalogManager products={products} stock={stock} />
      </details>
    </section>
  </AdminShell>;
}
