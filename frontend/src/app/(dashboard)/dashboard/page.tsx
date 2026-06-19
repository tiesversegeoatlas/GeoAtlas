"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Globe, ShieldAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KPIWidget } from "@/components/dashboard/KPIWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventStore } from "@/stores/eventStore";

const COLORS = ["#3B82F6", "#8B5CF6", "#EF4444", "#F97316", "#F59E0B", "#22C55E"];
const RISK_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#F59E0B",
  low: "#22C55E",
};

export default function DashboardPage() {
  const { events, loading, loadEvents } = useEventStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    void loadEvents();
  }, [loadEvents]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.category, (counts.get(event.category) || 0) + 1));
    return [...counts.entries()]
      .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [events]);

  const riskData = useMemo(() => {
    return ["critical", "high", "medium", "low"].map((name) => ({
      name,
      value: events.filter((event) => event.riskLevel === name).length,
      color: RISK_COLORS[name],
    }));
  }, [events]);

  const hotspots = useMemo(() => {
    const counts = new Map<string, number>();
    events
      .filter((event) => event.country !== "Location unconfirmed")
      .forEach((event) => counts.set(event.country, (counts.get(event.country) || 0) + 1));
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
  }, [events]);

  const highRisk = events.filter((event) => ["critical", "high"].includes(event.riskLevel)).length;
  const verified = events.filter((event) => event.verificationStatus === "verified").length;
  const averageConfidence = events.length
    ? Math.round(events.reduce((total, event) => total + event.confidenceScore, 0) / events.length)
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategic Dashboard</h1>
          <p className="text-muted-foreground">Live analytics from the GeoAtlas collection backend</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-primary text-sm font-bold uppercase tracking-wider">
          <Activity className="w-4 h-4" />
          {loading ? "Synchronizing" : "Live data"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIWidget title="Recent Events" value={events.length.toLocaleString()} change="API" isPositive icon={Globe} color="bg-primary" />
        <KPIWidget title="High Risk" value={highRisk.toString()} change="Live" isPositive={false} icon={ShieldAlert} color="bg-critical" />
        <KPIWidget title="Enriched Reports" value={verified.toString()} change="Live" isPositive icon={CheckCircle2} color="bg-low" />
        <KPIWidget title="Avg Confidence" value={`${averageConfidence}%`} change="Live" isPositive icon={AlertTriangle} color="bg-medium" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Events by Category</CardTitle>
            <CardDescription>Current collected output grouped by classification</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {mounted ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={100} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer> : <div className="h-full rounded-lg bg-white/5 animate-pulse" />}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Risk Distribution</CardTitle>
            <CardDescription>Severity inferred from collected event categories</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {mounted ? <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={105} paddingAngle={5} dataKey="value">
                  {riskData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937" }} />
              </PieChart>
            </ResponsiveContainer> : <div className="h-full rounded-lg bg-white/5 animate-pulse" />}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Location Activity</CardTitle>
          <CardDescription>Most frequent resolved locations in the latest collected output</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {hotspots.map((hotspot) => (
            <div key={hotspot.name} className="p-4 rounded-lg bg-white/5 border border-white/5">
              <div className="text-sm font-bold truncate">{hotspot.name}</div>
              <div className="text-2xl font-black text-primary mt-2">{hotspot.count}</div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Recent events</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
