"use client";

import { useEventStore } from "@/stores/eventStore";
import { useFilterStore } from "@/stores/filterStore";
import { EventCard } from "@/components/feed/EventCard";
import { FeedFilters } from "@/components/feed/FeedFilters";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rss, Filter, SlidersHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function FeedPage() {
  const { filteredEvents, loading, error, loadEvents } = useEventStore();
  const { categories, riskLevels } = useFilterStore();
  const [displayEvents, setDisplayEvents] = useState(filteredEvents);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    // Apply client-side filtering based on store filters
    let filtered = filteredEvents;

    if (categories.length > 0) {
      filtered = filtered.filter(e => categories.includes(e.category));
    }

    if (riskLevels.length > 0) {
      filtered = filtered.filter(e => riskLevels.includes(e.riskLevel));
    }

    setDisplayEvents(filtered);
  }, [filteredEvents, categories, riskLevels]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-120px)]">
      {/* Desktop Sidebar Filters */}
      <aside className="hidden lg:block w-72 shrink-0 h-[fit-content] sticky top-24">
        <FeedFilters />
      </aside>

      {/* Main Feed */}
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Rss className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Live Intelligence Feed</h1>
              <p className="text-sm text-muted-foreground">
                Showing {displayEvents.length} events matching your criteria
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden border-border bg-card">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-background border-border w-80">
                <div className="pt-8">
                  <FeedFilters />
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="outline" size="sm" className="border-border bg-card hidden sm:flex">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Display Settings
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Updating tactical data...</p>
          </div>
        ) : error ? (
          <div className="py-24 text-center border border-critical/30 rounded-xl bg-critical/5">
            <h3 className="text-xl font-bold text-critical mb-2">GeoAtlas API unavailable</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => void loadEvents(true)}>Retry connection</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {displayEvents.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <EventCard event={event} />
                </motion.div>
              ))}
            </AnimatePresence>

            {displayEvents.length === 0 && (
              <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-xl">
                <h3 className="text-xl font-bold mb-2">No intelligence matching filters</h3>
                <p className="text-muted-foreground">Try adjusting your risk levels or category selections.</p>
                <Button variant="link" className="mt-4 text-primary" onClick={() => window.location.reload()}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
