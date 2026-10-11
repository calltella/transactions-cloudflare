import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export class UserAuthenticationError extends Error {
  constructor() {
    super("ログインが必要です。");
    this.name = "UserAuthenticationError";
  }
}

/** Request-scoped publishable-key SDK client; getSession is only used to retrieve the token. */
export async function getUserDatabase() {
  const supabase = createClient(await cookies());
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) throw new UserAuthenticationError();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  const claims = claimsData?.claims;
  if (claimsError || !claims || claims.role !== "authenticated" ||
      typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) {
    throw new UserAuthenticationError();
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user || userData.user.id !== claims.sub) {
    throw new UserAuthenticationError();
  }
  return { supabase, user: userData.user, claims };
}
