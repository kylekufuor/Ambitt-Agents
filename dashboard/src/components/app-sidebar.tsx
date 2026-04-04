"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Bot,
  Activity,
  DollarSign,
  Zap,
  PlusCircle,
} from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems = [
  { title: "Oracle", href: "/oracle", icon: Zap },
  { title: "Agents", href: "/agents", icon: Bot },
  { title: "Create Agent", href: "/agents/create", icon: PlusCircle },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "Activity", href: "/activity", icon: Activity },
  { title: "Costs", href: "/costs", icon: DollarSign },
]

export function AppSidebar({ pendingCount }: { pendingCount?: number }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center shrink-0">
            <span className="text-background font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-[15px] text-foreground group-data-[collapsible=icon]:hidden">
            Ambitt
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.title === "Oracle" && pendingCount && pendingCount > 0 ? (
                      <SidebarMenuBadge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                        {pendingCount}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 space-y-2">
        <ThemeToggle />
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
            Oracle online
          </span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
