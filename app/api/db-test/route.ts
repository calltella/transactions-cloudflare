import { testDatabaseConnection } from "@/src/lib/db";

export async function GET() {
  const result = await testDatabaseConnection();

  return Response.json(result, {
    status: result.success ? 200 : 500,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
