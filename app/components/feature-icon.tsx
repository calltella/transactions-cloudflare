import { LayoutDashboard, Landmark, CreditCard, Wallet, FileUp, ListFilter, Settings, UserRound, ShieldCheck, Database, Sparkles, type LucideIcon } from "lucide-react";

const features: Record<string, { icon: LucideIcon; tone: string }> = {
  dashboard: { icon: LayoutDashboard, tone: "violet" },
  bank: { icon: Landmark, tone: "blue" },
  card: { icon: CreditCard, tone: "violet" },
  cash: { icon: Wallet, tone: "green" },
  import: { icon: FileUp, tone: "amber" },
  transactions: { icon: ListFilter, tone: "blue" },
  settings: { icon: Settings, tone: "rose" },
  profile: { icon: UserRound, tone: "blue" },
  admin: { icon: ShieldCheck, tone: "amber" },
  database: { icon: Database, tone: "blue" },
  quick: { icon: Sparkles, tone: "amber" },
};
export default function FeatureIcon({ kind, small = false }: { kind: string; small?: boolean }) {
  const { icon: Icon, tone } = features[kind] ?? features.dashboard;
  return <span aria-hidden="true" className={`feature-icon tone-${tone} ${small ? "feature-icon-small" : ""}`}><Icon size={small ? 18 : 24} strokeWidth={1.8}/></span>;
}
