/** app_metadata is managed by Supabase Auth administrators, never by end users. */
export function isDeveloperUser(user: { app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.app_metadata?.role === "admin";
}
