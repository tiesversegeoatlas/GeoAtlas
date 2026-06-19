"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPIWidgetProps {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  color: string;
}

export function KPIWidget({ title, value, change, isPositive, icon: Icon, color }: KPIWidgetProps) {
  return (
    <Card className="bg-card/40 border-border overflow-hidden relative group hover:border-primary/30 transition-colors">
      <div className={cn("absolute top-0 left-0 w-1 h-full", color)} />
      <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
        <Icon className="w-24 h-24" />
      </div>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 relative z-10">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("p-2 rounded-lg bg-white/5", color.replace("bg-", "text-"))}>
          <Icon className="w-4 h-4" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {change && (
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              "flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
              isPositive ? "bg-low/10 text-low" : "bg-critical/10 text-critical",
            )}>
              {isPositive ? "↑" : "↓"} {change}
            </div>
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
              live API
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
