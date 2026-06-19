"use client";

import React from 'react';
import { GeoEvent, RiskLevel } from "@/types";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  MessageSquare,
  Share2,
  Activity
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface EventCardProps {
  event: GeoEvent;
}

const riskStyles: Record<RiskLevel, { badge: string; border: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = {
  critical: { badge: "bg-critical text-white", border: "border-critical/20", icon: ShieldAlert },
  high: { badge: "bg-high text-white", border: "border-high/20", icon: ShieldAlert },
  medium: { badge: "bg-medium text-white", border: "border-medium/20", icon: ShieldAlert },
  low: { badge: "bg-low text-white", border: "border-low/20", icon: ShieldCheck },
};

export function EventCard({ event }: EventCardProps) {
  const styles = riskStyles[event.riskLevel];

  return (
    <Card className={cn(
      "bg-card/40 border-border group hover:border-primary/50 transition-all duration-300 relative overflow-hidden",
      styles.border
    )}>
      {/* Risk Background Glow */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none",
        event.riskLevel === 'critical' ? 'bg-critical' :
        event.riskLevel === 'high' ? 'bg-high' : 'bg-primary'
      )} />

      <CardHeader className="pb-3 relative">
        <div className="flex justify-between items-start mb-2">
          <div className="flex gap-2">
            <Badge className={cn("text-[10px] font-bold px-2 py-0 h-5", styles.badge)}>{event.riskLevel.toUpperCase()}</Badge>
            <Badge variant="outline" className="bg-background/30 border-border capitalize text-[10px] h-5 py-0">
              {event.category}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded border border-white/5">
            <Clock className="w-2.5 h-2.5" />
            {formatDistanceToNow(new Date(event.timestamp))} ago
          </div>
        </div>
        <CardTitle className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">
          <Link href={`/events/${event.id}`}>
            {event.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 relative">
        {event.imageUrl && (
          <Image
            src={event.imageUrl}
            alt=""
            width={640}
            height={320}
            className="w-full h-40 object-cover rounded-lg border border-border/60 mb-4"
            loading="lazy"
            unoptimized
          />
        )}
        <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
          {event.summary}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold uppercase tracking-tight">
          <div className="flex items-center gap-1.5 text-white/90">
            <MapPin className="w-3 h-3 text-primary" />
            {event.country}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className={cn(
              "w-3 h-3",
              event.verificationStatus === 'verified' ? "text-low" : "text-muted-foreground"
            )} />
            <span className={cn(
              event.verificationStatus === 'verified' ? "text-low/80" : ""
            )}>{event.verificationStatus}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="w-3 h-3 text-primary/70" />
            <span>CONF: {event.confidenceScore}%</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t border-border/40 flex justify-between items-center py-2 bg-white/[0.02] relative">
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10">
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10">
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-black tracking-widest text-primary hover:text-primary hover:bg-primary/10 gap-1 uppercase">
          <Link href={`/events/${event.id}`}>
            OPEN INTEL <ChevronRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
