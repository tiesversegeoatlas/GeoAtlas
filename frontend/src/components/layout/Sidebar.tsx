"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Map as MapIcon,
  Rss,
  ShieldAlert,
  FileText,
  Settings,
  Bell,
  ChevronRight,
  Globe,
  Database,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { title: "Live Feed", icon: Rss, href: "/feed" },
  { title: "Global Map", icon: MapIcon, href: "/map" },
];

const activeOpsItems = [
  { title: "Kharkiv Offensive", risk: "critical", href: "/events/e1" },
  { title: "Red Sea Security", risk: "high", href: "/events/e2" },
  { title: "Taipei Infrastructure", risk: "medium", href: "/events/e3" },
];

const secondaryNavItems = [
  { title: "Intelligence Clusters", icon: ShieldAlert, href: "/clusters" },
  { title: "Intelligence Reports", icon: FileText, href: "/reports" },
  { title: "Watchlist Alerts", icon: Bell, href: "/watchlist" },
  { title: "Admin Portal", icon: Database, href: "/admin" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-border bg-background/50">
        <Link href="/" className="flex items-center gap-3 font-bold text-xl tracking-tighter">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Globe className="w-5 h-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="leading-none">WARWATCH</span>
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Intelligence</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="scrollbar-hide">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50">Tactical Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className="h-10 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                  >
                    <Link href={item.href}>
                      <item.icon className="w-5 h-5" />
                      <span className="font-semibold">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50 flex justify-between">
            Active Operations
            <div className="w-1.5 h-1.5 rounded-full bg-critical animate-pulse" />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {activeOpsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-9 hover:bg-white/5">
                    <Link href={item.href} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          item.risk === 'critical' ? 'bg-critical shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                          item.risk === 'high' ? 'bg-high shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'bg-medium'
                        )} />
                        <span className="text-xs font-medium truncate">{item.title}</span>
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-50" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50">Intelligence Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className="h-10 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                  >
                    <Link href={item.href}>
                      <item.icon className="w-5 h-5" />
                      <span className="font-semibold">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-0">
        <div className="p-4 group-data-[collapsible=icon]:hidden">
          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                OP
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-none">Operator #0572</span>
                <span className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">Tier 2 Verified</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
              <span>Trust Level</span>
              <span className="text-low">98.4%</span>
            </div>
          </div>
        </div>
        <SidebarMenu className="p-2 border-t border-border">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Global Settings" className="hover:bg-primary/10 hover:text-primary">
              <Settings className="w-5 h-5" />
              <span className="font-medium">Global Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Secure Support" className="hover:bg-primary/10 hover:text-primary">
              <Users className="w-5 h-5" />
              <span className="font-medium">Secure Support</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
