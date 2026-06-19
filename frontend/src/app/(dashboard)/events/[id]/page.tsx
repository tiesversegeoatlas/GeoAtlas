"use client";

import { use, useEffect, useState } from "react";
import { useEventStore } from "@/stores/eventStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  Clock,
  MapPin,
  ShieldCheck,
  Share2,
  ExternalLink,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  Activity
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { events, loadEvent } = useEventStore();
  const [event, setEvent] = useState(() => events.find((entry) => entry.id === id) || null);
  const [loading, setLoading] = useState(!event);

  useEffect(() => {
    if (event) return;
    void loadEvent(id).then((loaded) => {
      setEvent(loaded);
      setLoading(false);
    });
  }, [event, id, loadEvent]);

  if (loading) {
    return <div className="py-24 text-center text-muted-foreground">Loading intelligence from GeoAtlas...</div>;
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <h1 className="text-2xl font-bold text-muted-foreground">Intelligence Not Found</h1>
        <Button asChild>
          <Link href="/feed">Return to Live Feed</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
          <Link href="/feed"><ChevronLeft className="w-4 h-4" /> Back to Feed</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-border"><Share2 className="w-4 h-4" /> Share Intel</Button>
          <Button variant="outline" size="sm" className="gap-2 border-border"><Info className="w-4 h-4" /> Export Report</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Header Info */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={cn(
                "px-3 py-1 text-xs font-bold",
                event.riskLevel === 'critical' ? 'bg-critical' :
                event.riskLevel === 'high' ? 'bg-high' :
                event.riskLevel === 'medium' ? 'bg-medium' : 'bg-low'
              )}>
                {event.riskLevel.toUpperCase()} RISK
              </Badge>
              <Badge variant="secondary" className="px-3 py-1 text-xs font-bold uppercase tracking-wider">
                {event.category}
              </Badge>
              <Badge variant="outline" className={cn(
                "px-3 py-1 text-xs font-bold border-border",
                event.verificationStatus === 'verified' ? "text-low" : "text-muted-foreground"
              )}>
                {event.verificationStatus.toUpperCase()}
              </Badge>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight leading-tight">{event.title}</h1>

            <div className="flex flex-wrap gap-6 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {event.region}, {event.country}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Initial Report: {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm')} UTC
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Confidence: <span className="text-white font-bold">{event.confidenceScore}%</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="prose prose-invert max-w-none">
            <h3 className="text-xl font-bold mb-4 border-b border-border pb-2">Intelligence Summary</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {event.description}
            </p>
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> Tactical Timeline
            </h3>
            <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
              {event.timeline.length > 0 ? event.timeline.map((entry, idx) => (
                <div key={idx} className="relative pl-12">
                  <div className="absolute left-0 top-1.5 w-[36px] h-[36px] rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">{entry.date}</div>
                    <p className="text-sm text-muted-foreground">{entry.description}</p>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center bg-card/30 rounded-xl border border-dashed border-border italic text-muted-foreground">
                  No timeline data available for this sector.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Tactical Map */}
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="p-4 border-b border-border bg-white/5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-widest">Sector Visualization</CardTitle>
              <Layers className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <div className="h-64 relative">
              <MapView events={[event]} selectedEvent={event} />
              <div className="absolute bottom-4 right-4 z-[1000]">
                <Button size="icon" variant="secondary" className="h-8 w-8 bg-card border border-border shadow-lg">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Verification Status */}
          <Card className="bg-card border-border">
            <CardHeader className="p-4 border-b border-border bg-white/5">
              <CardTitle className="text-xs font-bold uppercase tracking-widest">Verification Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Confidence Score</span>
                <span className="text-xs font-bold text-low">{event.confidenceScore}%</span>
              </div>
              <div className="w-full bg-border rounded-full h-1.5">
                <div className="bg-low h-1.5 rounded-full" style={{ width: `${event.confidenceScore}%` }} />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                <ShieldCheck className="w-5 h-5 text-low" />
                <div className="text-xs">
                  <div className="font-bold text-white uppercase">GeoAtlas extraction status</div>
                  <div className="text-muted-foreground">Confidence reflects resolved location evidence and source reliability.</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sources */}
          <Card className="bg-card border-border">
            <CardHeader className="p-4 border-b border-border bg-white/5">
              <CardTitle className="text-xs font-bold uppercase tracking-widest">Intelligence Sources</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {event.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-md hover:bg-white/5 transition-colors group"
                >
                  <span className="text-xs font-medium group-hover:text-primary transition-colors">{source.name}</span>
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
