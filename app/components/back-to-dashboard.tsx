import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

export default function BackToDashboard() {
  return <Link href="/" className="back-to-dashboard group inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm">
    <ArrowLeft size={16} aria-hidden="true" className="back-arrow"/>
    <LayoutDashboard size={18} aria-hidden="true"/>
    <span>ダッシュボードへ戻る</span>
  </Link>;
}
