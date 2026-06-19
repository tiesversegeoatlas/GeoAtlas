"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Activity, ArrowUpRight } from "lucide-react";
import Link from "next/link";

const hotspots = [
  { 
    name: "Kharkiv Front", 
    region: "Ukraine", 
    risk: "Critical", 
    desc: "Renewed offensive operations and heavy artillery exchange.",
    status: "Escalating"
  },
  { 
    name: "Bab al-Mandab", 
    region: "Red Sea", 
    risk: "High", 
    desc: "Persistent missile threats to commercial maritime traffic.",
    status: "Active"
  },
  { 
    name: "Taiwan Strait", 
    region: "East Asia", 
    risk: "High", 
    desc: "Large-scale air and naval exercises reported.",
    status: "Tense"
  },
  { 
    name: "Rafah Operations", 
    region: "Gaza", 
    risk: "Critical", 
    desc: "Urban combat and severe humanitarian situation.",
    status: "Critical"
  },
];

export function HotspotsSection() {
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
            key={spot.name}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            viewport={{ once: true }}
          >
            <Card className="h-full bg-card/50 border-border hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={spot.risk === "Critical" ? "destructive" : "secondary"}>
                    {spot.risk}
                  </Badge>
                  <Activity className={`w-4 h-4 ${spot.risk === "Critical" ? "text-critical" : "text-high"}`} />
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">{spot.name}</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wider">{spot.region}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {spot.desc}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Status:</span>
                  <span className="font-bold text-white uppercase">{spot.status}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
