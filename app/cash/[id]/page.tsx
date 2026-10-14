import AccountHistory from "@/bank-accounts/[id]/page";
export const dynamic = "force-dynamic";
export default function CashHistory(props: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) { return <AccountHistory {...props} cash/>; }
