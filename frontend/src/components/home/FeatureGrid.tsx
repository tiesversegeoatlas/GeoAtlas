"use client";

import { motion } from "framer-motion";
import {
  Rss,
  Map as MapIcon,
  ShieldCheck,
  BarChart3,
  FileText,
  Bell
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const features = [
  {
    title: "Live Intel Feed",
    desc: "Real-time stream of verified geopolitical events with millisecond updates.",
    icon: Rss,
    color: "text-primary"
  },
  {
    title: "Global Risk Map",
    desc: "Interactive spatial visualization of conflicts, terror threats, and disasters.",
    icon: MapIcon,
    color: "text-high"
  },
  {
    title: "Verification Engine",
    desc: "Rigorous 3-tier verification system ensures intelligence reliability and confidence.",
    icon: ShieldCheck,
    color: "text-low"
  },
  {
    title: "Advanced Analytics",
    desc: "Deep-dive dashboards visualizing trends, correlations, and risk scores.",
    icon: BarChart3,
    color: "text-medium"
  },
  {
    title: "Strategic Reports",
    desc: "In-depth analysis from security experts and OSINT specialists.",
    icon: FileText,
    color: "text-blue-400"
  },
  {
    title: "Smart Watchlists",
    desc: "Customizable alerts for specific regions, actors, or conflict categories.",
    icon: Bell,
    color: "text-critical"
  },
];

export function FeatureGrid() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Enterprise Intelligence Capabilities</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our platform provides the tools required by security professionals to maintain global situational awareness.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="bg-card/50 border-border hover:bg-card hover:translate-y-[-4px] transition-all duration-300 h-full">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-4 ${feature.color}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
