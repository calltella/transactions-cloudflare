import { env } from "cloudflare:workers";
import { getDeveloperAccess } from "@/src/lib/auth/developer";
import { testDatabaseConnection } from "@/src/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const access = await getDeveloperAccess();
  if (!access.allowed) {
    return Response.json({ success: false, error: "Access denied." }, {
      status: access.authenticated ? 403 : 401, headers,
    });
  }
  const result = await testDatabaseConnection(env.HYPERDRIVE);
  return Response.json(result, { status: result.success ? 200 : 500, headers });
}
