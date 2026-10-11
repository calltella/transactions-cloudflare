import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isDeveloperUser } from "./developer-policy";

export function isDeveloper(userId: string | undefined) {
  const allowedIds = (env as { DEVELOPER_USER_IDS?: string }).DEVELOPER_USER_IDS;
  return isDeveloperUser(userId, allowedIds);
}

export async function getDeveloperAccess() {
  const supabase = createClient(await cookies());
  const { data: { user }, error } = await supabase.auth.getUser();
  return { authenticated: !error && !!user, allowed: !error && isDeveloper(user?.id) };
}
