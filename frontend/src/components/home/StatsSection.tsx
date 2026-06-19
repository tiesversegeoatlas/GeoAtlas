"use client";

import { motion } from "framer-motion";
import { useEventStore } from "@/stores/eventStore";
import { useEffect } from "react";

export function StatsSection() {
  const { events, loadEvents } = useEventStore();
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);
  const stats = [
    { label: "Recent events tracked", value: events.length.toLocaleString(), color: "text-primary" },
    { label: "High risk events", value: events.filter((event) => ["critical", "high"].includes(event.riskLevel)).length.toString(), color: "text-critical" },
    { label: "Enriched reports", value: events.filter((event) => event.verificationStatus === "verified").length.toString(), color: "text-low" },
    { label: "Locations monitored", value: new Set(events.map((event) => event.country).filter((name) => name !== "Location unconfirmed")).size.toString(), color: "text-medium" },
  ];
  return (
    <section className="py-20 border-y border-border bg-card/30">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className={`text-4xl md:text-5xl font-bold mb-2 ${stat.color}`}>
                {stat.value}
              </div>
              <div className="text-sm md:text-base text-muted-foreground font-medium">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
