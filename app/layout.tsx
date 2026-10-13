import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isDeveloper } from "@/src/lib/auth/developer";
import Navigation from "./components/navigation";

export const metadata: Metadata = {
  title: { default: "家計管理", template: "%s | 家計管理" },
  description: "取引・カード・銀行口座をまとめて管理",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = createClient(await cookies());
  const { data: { user }, error } = await supabase.auth.getUser();
  const authenticated = !error && user;
  return (
    <html lang="ja">
      <body><Navigation email={authenticated ? user.email ?? "ユーザー" : null} administrator={!!authenticated && isDeveloper(user)} />{children}</body>
    </html>
  );
}
