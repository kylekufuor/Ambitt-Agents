import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { email?: string } | null = null;

  if (process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true") {
    user = { email: process.env.ADMIN_EMAIL ?? "dev@ambitt.agency" };
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
    if (!user) redirect("/login");
  }

  const pendingCount = await prisma.agent.count({
    where: { status: "pending_approval" },
  });

  return (
    <SidebarProvider>
      <AppSidebar pendingCount={pendingCount} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-muted-foreground text-xs">{user.email}</span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
