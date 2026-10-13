import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isDeveloperUser } from "./developer-policy";

export const isDeveloper = isDeveloperUser;

export async function getDeveloperAccess() {
  const supabase = createClient(await cookies());
  // Fetch the current Auth record so permission removal does not wait for JWT refresh.
  const { data: { user }, error } = await supabase.auth.getUser();
  return { authenticated: !error && !!user, allowed: !error && isDeveloper(user) };
}
