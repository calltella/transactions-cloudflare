import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./module-loader.mjs";

const developerId = "c34a94a8-fcb8-4ca8-a1ab-6f097059effd";

for (const scenario of [
  { name: "anonymous", user: null, status: 401 },
  { name: "ordinary user with forged profile role", user: { id: "other", user_metadata: { role: "developer" } }, status: 403 },
  { name: "developer", user: { id: developerId }, status: 200 },
  { name: "Docker developer", user: { id: "d629d117-2f96-481b-9980-329fbf581f68" }, allowedIds: "d629d117-2f96-481b-9980-329fbf581f68", status: 200 },
  { name: "remote developer rejected by Docker", user: { id: developerId }, allowedIds: "d629d117-2f96-481b-9980-329fbf581f68", status: 403 },
  { name: "Docker developer rejected remotely", user: { id: "d629d117-2f96-481b-9980-329fbf581f68" }, status: 403 },
  { name: "empty allowlist", user: { id: developerId }, allowedIds: "", status: 403 },
  { name: "invalid session", user: { id: developerId }, error: new Error("expired"), status: 401 },
]) {
  test(`DB API: ${scenario.name}`, async () => {
    let dbCalls = 0;
    const route = await loadModule("app/api/developer/db-test/route.ts", {
      "cloudflare:workers": { env: { DEVELOPER_USER_IDS: scenario.allowedIds ?? developerId, HYPERDRIVE: {} } },
      "next/headers": { cookies: async () => ({}) },
      "@/utils/supabase/server": { createClient: () => ({ auth: {
        getUser: async () => ({ data: { user: scenario.user }, error: scenario.error }),
      } }) },
      "@/src/lib/db": { testDatabaseConnection: async () => { dbCalls++; return { success: true }; } },
    });
    const response = await route.GET();
    assert.equal(response.status, scenario.status);
    assert.equal(dbCalls, scenario.status === 200 ? 1 : 0);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
}

test("session refresh updates request and response cookies", async () => {
  const request = { headers: new Headers(), cookies: new Map([["session", "expired"]]) };
  request.cookies.getAll = () => [...request.cookies].map(([name, value]) => ({ name, value }));
  let calls = 0;
  const module = await loadModule("app/utils/supabase/middleware.ts", {
    "./config": { getSupabaseConfig: () => ({ url: "https://example.test", key: "public" }) },
    "next/server": { NextResponse: { next: () => ({ headers: new Headers(), cookies: new Map() }) } },
    "@supabase/ssr": { createServerClient: (_url, _key, options) => ({ auth: {
      getUser: async () => {
        calls++;
        assert.equal(options.cookies.getAll()[0].value, "expired");
        options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true } }]);
      },
    } }) },
  });
  const response = await module.updateSession(request);
  assert.equal(calls, 1);
  assert.equal(request.cookies.get("session"), "refreshed");
  assert.equal(response.cookies.get("session"), "refreshed");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("registration and malformed login do not call Supabase", async () => {
  let authCalls = 0;
  const module = await loadModule("app/login/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url) => { throw new Error(url); } },
    "next/headers": { cookies: async () => ({}) },
    "@/utils/supabase/server": { createClient: () => { authCalls++; throw new Error("unexpected auth call"); } },
  });
  await assert.rejects(module.signup(), /\/login\?error=/);
  await assert.rejects(module.login(new FormData()), /\/login\?error=/);
  const malformed = new FormData();
  malformed.set("email", "invalid");
  malformed.set("password", "password");
  await assert.rejects(module.login(malformed), /\/login\?error=/);
  assert.equal(authCalls, 0);
});

test("DB diagnostics report total count and local source, redact errors, and close connections", async () => {
  let shouldFail = false;
  let closed = 0;
  class Client {
    constructor(options) { assert.equal(options.query_timeout, 5000); }
    async connect() { if (shouldFail) throw new Error("password=secret"); }
    async query(sql) {
      if (sql.includes("NOW()")) return { rows: [{ tables_count: 25 }] };
      return { rows: [{ table_name: "example" }], rowCount: 1 };
    }
    async end() { closed++; }
  }
  const module = await loadModule("app/src/lib/db/index.ts", { pg: { Client } });
  const previous = { nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL };
  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = "postgresql://example";
  try {
    const success = await module.testDatabaseConnection();
    assert.equal(success.tablesCount, 25);
    assert.equal(success.connectionStringSource, "Local DATABASE_URL");
    shouldFail = true;
    const failure = await module.testDatabaseConnection();
    assert.equal(failure.success, false);
    assert.ok(!failure.error.includes("secret"));
    assert.equal(closed, 2);
  } finally {
    for (const [key, value] of [["NODE_ENV", previous.nodeEnv], ["DATABASE_URL", previous.databaseUrl]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
