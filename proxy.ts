import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/", "/login", "/developer/:path*", "/api/developer/:path*", "/transactions/:path*", "/api/transactions/:path*"],
};
