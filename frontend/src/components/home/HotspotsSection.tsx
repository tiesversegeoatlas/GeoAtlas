"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Activity, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEventStore } from "@/stores/eventStore";
import { useEffect } from "react";

export function HotspotsSection() {
  const { events, loadEvents } = useEventStore();
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);
  const hotspots = events
    .filter((event) => event.country !== "Location unconfirmed")
    .slice(0, 4);
  return (
    <section className="py-24 container mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-4">Intelligence Hotspots</h2>
          <p className="text-muted-foreground max-w-xl">
            Real-time monitoring of high-intensity zones and strategic flashpoints across the globe.
          </p>
        </div>
        <Link href="/map" className="text-primary hover:underline flex items-center gap-1 font-medium">
          View all on Global Map <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {hotspots.map((spot, index) => (
          <motion.div
            key={spot.id}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            viewport={{ once: true }}
          >
            <Card className="h-full bg-card/50 border-border hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={spot.riskLevel === "critical" ? "destructive" : "secondary"}>
                    {spot.riskLevel}
                  </Badge>
                  <Activity className={`w-4 h-4 ${spot.riskLevel === "critical" ? "text-critical" : "text-high"}`} />
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                  <Link href={`/events/${spot.id}`}>{spot.title}</Link>
                </CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wider">{spot.country}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {spot.summary}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Status:</span>
                  <span className="font-bold text-white uppercase">{spot.verificationStatus}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
