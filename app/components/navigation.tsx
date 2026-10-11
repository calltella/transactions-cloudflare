"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "@/login/actions";

const menus = [
  { href: "/", label: "ダッシュボード" },
  { href: "/transactions", label: "取引一覧" },
  { href: "/transactions/import", label: "CSV取込" },
  { href: "/cards", label: "カード" },
  { href: "/bank-accounts", label: "銀行口座" },
];

export default function Navigation({ email, administrator }: { email: string | null; administrator: boolean }) {
  const path = usePathname();
  const header = useRef<HTMLElement>(null);
  const close = () => header.current?.querySelectorAll("details[open]").forEach(item => item.removeAttribute("open"));
  useEffect(() => { close(); }, [path]);
  useEffect(() => {
    const click = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { const open = header.current?.querySelector<HTMLDetailsElement>("details[open]"); open?.querySelector<HTMLElement>("summary")?.focus(); close(); } };
    document.addEventListener("pointerdown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", click); document.removeEventListener("keydown", key); };
  }, []);
  const active = (href: string) => path === href || (href === "/developer" && path.startsWith("/developer/"));
  const item = (href: string, label: string) => <Link key={href} href={href} onClick={close} aria-current={active(href) ? "page" : undefined}
    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(href) ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}>{label}</Link>;
  return <header ref={header} className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
    <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
      <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight" aria-label="家計管理 ホーム">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">¥</span><span className="hidden sm:inline">家計管理</span>
      </Link>
      {email && <nav aria-label="メインメニュー" className="hidden min-w-0 items-center gap-1 lg:flex">{menus.map(m => item(m.href, m.label))}</nav>}
      <div className="ml-auto flex items-center gap-2">
        {email && <details className="relative lg:hidden">
          <summary className="nav-summary rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">メニュー <span aria-hidden="true">⌄</span></summary>
          <nav aria-label="モバイルメニュー" className="nav-dropdown right-0 w-48 flex flex-col">{menus.map(m => item(m.href, m.label))}</nav>
        </details>}
        {administrator && <details className="relative">
          <summary className="nav-summary rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950">管理者 <span aria-hidden="true">⌄</span></summary>
          <nav aria-label="管理者メニュー" className="nav-dropdown right-0 w-52 flex flex-col">
            {item("/developer", "開発・データ管理")}{item("/developer/db-test", "DB接続診断")}
          </nav>
        </details>}
        {email ? <details className="relative">
          <summary aria-label="ユーザーメニュー" className="nav-summary flex items-center gap-2 rounded-full border border-gray-200 p-1.5 pr-3 dark:border-gray-700">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{email[0].toUpperCase()}</span>
            <span className="hidden max-w-32 truncate text-sm xl:inline">{email.split("@")[0]}</span><span aria-hidden="true">⌄</span>
          </summary>
          <div className="nav-dropdown right-0 w-64">
            <p className="px-3 pt-2 text-xs text-gray-500">ログイン中</p><p className="break-all px-3 pb-3 pt-1 text-sm font-medium">{email}</p>
            <nav aria-label="ユーザーメニュー" className="flex flex-col border-t border-gray-100 pt-2 dark:border-gray-700">
              {item("/profile", "プロフィール")}{item("/settings", "設定")}
            </nav>
            <form action={logout} className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700"><button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">ログアウト</button></form>
          </div>
        </details> : item("/login", "ログイン")}
      </div>
    </div>
  </header>;
}
