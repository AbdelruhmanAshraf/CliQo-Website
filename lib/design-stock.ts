import 'server-only';
import {getDb} from './db';

export type DesignStockRow={familyKey:string;face:string;variant:string;available:number};

export async function getDesignStock(familyKeys:string[]):Promise<DesignStockRow[]> {
  if(!familyKeys.length||!process.env.CLIQO_DATABASE_URL)return [];
  const {rows}=await getDb().query<{family_key:string;face:string;variant:string;available:number}>(
    `select f.family_key,coalesce(s.options->>'face','') as face,coalesce(s.options->>'variant','') as variant,
      coalesce(sum(greatest(b.on_hand-b.reserved,0)),0)::int as available
      from public.product_skus s join public.product_families f on f.id=s.product_family_id
      join public.inventory_balances b on b.sku_id=s.id
      where f.family_key=any($1::text[]) and s.state<>'paused' and not s.checkout_test
      group by f.family_key,s.options->>'face',s.options->>'variant'`,[familyKeys]);
  return rows.map(row=>({familyKey:row.family_key,face:row.face,variant:row.variant,available:row.available}));
}
