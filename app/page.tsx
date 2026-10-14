import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import Link from 'next/link'
import Dashboard from './components/dashboard'
import FeatureIcon from './components/feature-icon'
import { ArrowUpRight } from 'lucide-react'

const shortcuts = [
  { href: '/transactions', title: '取引一覧', description: '日々の収支を確認', kind: 'transactions' },
  { href: '/transactions/import', title: 'CSV取込', description: 'ファイルから取引を取り込む', kind: 'import' },
  { href: '/cards', title: 'カード設定', description: '締め日と引き落としを管理', kind: 'card' },
  { href: '/cash', title: '現金設定', description: '財布の残高と入出金を管理', kind: 'cash' },
  { href: '/bank-accounts', title: '銀行口座設定', description: '口座情報と開始残高を管理', kind: 'bank' },
]

export default async function Page() {
  const supabase = createClient(await cookies())
  const { data: { user }, error } = await supabase.auth.getUser()
  return <main className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10 sm:px-6">
    <div className="max-w-6xl mx-auto space-y-8">
      {!error && user ? <Dashboard /> : <section className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white sm:p-10">
        <p className="text-xs font-semibold tracking-widest text-indigo-200">家計管理</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">お金の流れを、ひとつの場所に。</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-indigo-100">取引の取り込みから、カード・銀行口座の設定まで。上部メニューから各画面を開けます。</p>
        {(error || !user) && <Link href="/login" className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700">ログインして始める</Link>}
      </section>}
      {!error && user && <section aria-labelledby="shortcut-heading">
        <h2 id="shortcut-heading" className="mb-4 flex items-center gap-3 text-lg font-semibold"><FeatureIcon kind="quick" small/>クイックアクセス</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {shortcuts.map(item => <Link key={item.href} href={item.href} className="shortcut-card group rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500">
            <div className="flex items-center justify-between"><FeatureIcon kind={item.kind}/><ArrowUpRight size={18} aria-hidden="true" className="text-gray-400 transition-colors group-hover:text-indigo-500"/></div>
            <h3 className="mt-5 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
            <p className="mt-5 text-sm text-indigo-600 dark:text-indigo-300">開く <span aria-hidden="true">→</span></p>
          </Link>)}
        </div>
      </section>}
    </div>
  </main>
}
