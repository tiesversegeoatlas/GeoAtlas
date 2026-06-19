"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ message = "Gathering tactical data...", className }: { message?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 gap-4", className)}>
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">{message}</p>
    </div>
  );
}
