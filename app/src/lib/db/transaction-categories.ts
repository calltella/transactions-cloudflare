import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function transactionCategoryNames(supabase: SupabaseClient<Database>, rows: { parent_category_id: number | null; child_category_id: number | null }[]) {
  async function names(table: "parent_categories" | "child_categories", ids: number[]) {
    const result = new Map<number,string>();
    const unique = [...new Set(ids)];
    for (let offset=0;offset<unique.length;offset+=500) {
      const {data,error} = await supabase.from(table).select("id,name").in("id",unique.slice(offset,offset+500));
      if(error) throw new Error("カテゴリを取得できませんでした。");
      for(const row of data ?? []) result.set(row.id,row.name);
    }
    return result;
  }
  const [parents,children] = await Promise.all([
    names("parent_categories",rows.flatMap(row=>row.parent_category_id===null?[]:[row.parent_category_id])),
    names("child_categories",rows.flatMap(row=>row.child_category_id===null?[]:[row.child_category_id])),
  ]);
  return {parents,children};
}
