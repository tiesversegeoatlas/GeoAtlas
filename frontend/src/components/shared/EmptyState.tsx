"use client";

import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "No data found",
  description = "Adjust your filters or check back later.",
  className
}: {
  title?: string;
  description?: string;
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-xl bg-card/30", className)}>
      <Inbox className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
      <h3 className="text-xl font-bold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}
