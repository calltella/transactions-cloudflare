import { notFound, redirect } from "next/navigation";
import { getDeveloperAccess } from "@/src/lib/auth/developer";

export const dynamic = "force-dynamic";

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const access = await getDeveloperAccess();
  if (!access.authenticated) redirect("/login");
  if (!access.allowed) notFound();
  return children;
}
