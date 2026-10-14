import FeatureIcon from "@/components/feature-icon";
"use client";
// /app/app/db-test/page.tsx
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface DbTestResponse {
  success: boolean;
  now?: string;
  version?: string;
  database?: string;
  tablesCount?: number;
  tables?: string[];
  latencyMs?: number;
  connectionStringSource?: string;
  error?: string;
}

export default function DbTestPage() {
  const [data, setData] = useState<DbTestResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [testedAt, setTestedAt] = useState<string>("");

  const runTest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/developer/db-test", { cache: "no-store" });
      const json: DbTestResponse = await res.json();
      setData(json);
    } catch (err) {
      setData({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      setTestedAt(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    runTest();
  }, [runTest]);

  return (
    <main data-theme="database" className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/developer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm flex items-center gap-1"
            >
              &larr; 開発画面へ戻る
            </Link>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Supabase Hyperdrive Connection Test
          </span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight"><FeatureIcon kind="database"/>
                Database Connection Status
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Cloudflare Workers &rarr; Hyperdrive &rarr; Supabase Database
              </p>
            </div>
            <button
              onClick={runTest}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Testing...
                </span>
              ) : (
                "Re-test Connection"
              )}
            </button>
          </div>

          {loading && !data ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400 animate-pulse">
              Connecting to Supabase Database via Hyperdrive...
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Status Header Badge */}
              <div
                className={`p-4 rounded-lg flex items-center justify-between border ${data.success
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${data.success ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                      }`}
                  />
                  <div>
                    <span className="font-semibold text-base">
                      {data.success ? "Connection Successful" : "Connection Failed"}
                    </span>
                    {testedAt && (
                      <p className="text-xs opacity-75 mt-0.5">
                        Last checked at {testedAt}
                      </p>
                    )}
                  </div>
                </div>
                {data.latencyMs !== undefined && (
                  <span className="text-xs font-mono font-medium px-2.5 py-1 bg-white/60 dark:bg-black/20 rounded-md border border-current/20">
                    {data.latencyMs} ms
                  </span>
                )}
              </div>

              {/* Success Info Grid */}
              {data.success ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                      Database Name
                    </span>
                    <p className="font-mono text-sm font-semibold mt-1">
                      {data.database || "N/A"}
                    </p>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                      Connection Source
                    </span>
                    <p className="font-mono text-sm font-semibold mt-1">
                      {data.connectionStringSource || "Hyperdrive"}
                    </p>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800 md:col-span-2">
                    <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                      Server Current Timestamp
                    </span>
                    <p className="font-mono text-sm font-semibold mt-1">
                      {data.now || "N/A"}
                    </p>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800 md:col-span-2">
                    <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                      PostgreSQL Version
                    </span>
                    <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                      {data.version || "N/A"}
                    </p>
                  </div>

                  {data.tables && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800 md:col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                          Public Tables ({data.tablesCount ?? 0}, showing up to 10)
                        </span>
                      </div>
                      {data.tables.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {data.tables.map((tbl) => (
                            <span
                              key={tbl}
                              className="px-2 py-0.5 font-mono text-xs rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                            >
                              {tbl}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic mt-1">
                          No public tables found.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Error Details */
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 space-y-2">
                  <h3 className="font-semibold text-sm">Error Message:</h3>
                  <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-rose-100/50 dark:bg-rose-950/80 p-3 rounded border border-rose-200 dark:border-rose-800">
                    {data.error || "Unknown database connection error."}
                  </pre>
                </div>
              )}

              {/* Raw JSON Details */}
              <details className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
                <summary className="cursor-pointer hover:underline font-medium">
                  View Raw JSON Response
                </summary>
                <pre className="mt-2 p-3 font-mono bg-gray-100 dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 overflow-x-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
