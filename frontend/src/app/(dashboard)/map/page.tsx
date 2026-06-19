"use client";

import dynamic from "next/dynamic";
import { useEventStore } from "@/stores/eventStore";
import { useFilterStore } from "@/stores/filterStore";
import { FeedFilters } from "@/components/feed/FeedFilters";
import { Card } from "@/components/ui/card";
import { Map as MapIcon, Info, Layers } from "lucide-react";

const MapView = dynamic(() => import("@/components/map/MapView"), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-card animate-pulse rounded-xl" />
});

export default function MapPage() {
  const { filteredEvents, selectedEvent } = useEventStore();
  const { categories, riskLevels } = useFilterStore();

  const activeEvents = filteredEvents.filter(e => {
    const categoryMatch = categories.length === 0 || categories.includes(e.category);
    const riskMatch = riskLevels.length === 0 || riskLevels.includes(e.riskLevel);
    return categoryMatch && riskMatch;
  });

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Global Risk Visualization</h1>
            <p className="text-sm text-muted-foreground">
              Geospatial distribution of {activeEvents.length} active intelligence points
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6 p-2 px-4 bg-card/50 rounded-lg border border-border text-xs font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-critical" />
            <span>Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-high" />
            <span>High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-medium" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-low" />
            <span>Low</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
        <Card className="flex-1 relative overflow-hidden border-border bg-card">
          <MapView events={activeEvents} selectedEvent={selectedEvent} />
          
          {/* Map Overlays */}
          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
            <button className="p-2 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors">
              <Layers className="w-4 h-4" />
            </button>
            <button className="p-2 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors">
              <Info className="w-4 h-4" />
            </button>
          </div>
        </Card>

        <aside className="w-full lg:w-80 shrink-0 overflow-y-auto pr-2 scrollbar-hide">
          <FeedFilters />
          
          <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <h4 className="text-xs font-bold uppercase mb-3 text-primary tracking-widest">Tactical Insight</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cluster detected in the Eastern European sector. 12 related events verified within the last 48 hours. Risk score increased by 14%.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
