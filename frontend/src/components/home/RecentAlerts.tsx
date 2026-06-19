"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const alerts = [
  {
    id: 1,
    title: "Artillery Barrage in Kharkiv Sector",
    time: "14 mins ago",
    type: "critical",
    icon: ShieldAlert
  },
  {
    id: 2,
    title: "Cyber disruption of Baltic Power Grid",
    time: "28 mins ago",
    type: "high",
    icon: AlertTriangle
  },
  {
    id: 3,
    title: "Movement detected in Sahel border region",
    time: "45 mins ago",
    type: "medium",
    icon: Info
  },
];

export function RecentAlerts() {
  return (
    <section className="py-12 bg-background border-b border-border">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-critical animate-ping" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Live Alerts</h3>
          </div>
          <button className="text-xs text-primary hover:underline font-bold uppercase tracking-widest">
            View All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {alerts.map((alert, index) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-4 p-4 rounded-lg bg-card/40 border border-border/50 group hover:border-primary/30 transition-colors"
            >
              <div className={`p-2 rounded bg-white/5 ${
                alert.type === 'critical' ? 'text-critical' : 
                alert.type === 'high' ? 'text-high' : 'text-medium'
              }`}>
                <alert.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                  {alert.title}
                </h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                  {alert.time}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 h-5 border-border/50">
                LIVE
              </Badge>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
