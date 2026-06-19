"use client";

import { motion } from "framer-motion";

const stats = [
  { label: "Total Events tracked", value: "1,284", color: "text-primary" },
  { label: "High Risk Events", value: "42", color: "text-critical" },
  { label: "Verified Reports", value: "856", color: "text-low" },
  { label: "Countries Monitored", value: "192", color: "text-medium" },
];

export function StatsSection() {
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
