"use client";

import { KPIWidget } from "@/components/dashboard/KPIWidget";
import { 
  ShieldAlert, 
  Globe, 
  CheckCircle2, 
  AlertTriangle,
  Activity
} from "lucide-react";
import { 
  Line, 
  LineChart, 
  Bar, 
  BarChart, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  Pie,
  PieChart,
  CartesianGrid
} from "recharts";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card";

const categoryData = [
  { name: "Conflict", value: 45, color: "#3B82F6" },
  { name: "Cyber", value: 32, color: "#8B5CF6" },
  { name: "Terrorism", value: 24, color: "#EF4444" },
  { name: "Military", value: 18, color: "#F97316" },
  { name: "Unrest", value: 12, color: "#F59E0B" },
];

const trendData = [
  { date: "May 10", events: 12, risk: 45 },
  { date: "May 11", events: 15, risk: 52 },
  { date: "May 12", events: 10, risk: 48 },
  { date: "May 13", events: 22, risk: 65 },
  { date: "May 14", events: 30, risk: 78 },
  { date: "May 15", events: 25, risk: 72 },
  { date: "May 16", events: 28, risk: 75 },
];

const riskData = [
  { name: "Critical", value: 12, color: "#EF4444" },
  { name: "High", value: 25, color: "#F97316" },
  { name: "Medium", value: 42, color: "#F59E0B" },
  { name: "Low", value: 65, color: "#22C55E" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategic Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive intelligence overview and analytical trends</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-primary text-sm font-bold uppercase tracking-wider">
          <Activity className="w-4 h-4" />
          Live Pulse: High Activity
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIWidget 
          title="Total Events" 
          value="1,482" 
          change="12%" 
          isPositive={false} 
          icon={Globe} 
          color="bg-primary" 
        />
        <KPIWidget 
          title="Critical Alerts" 
          value="42" 
          change="5%" 
          isPositive={false} 
          icon={ShieldAlert} 
          color="bg-critical" 
        />
        <KPIWidget 
          title="Verified Reports" 
          value="856" 
          change="24%" 
          isPositive={true} 
          icon={CheckCircle2} 
          color="bg-low" 
        />
        <KPIWidget 
          title="Avg Confidence" 
          value="84%" 
          change="2%" 
          isPositive={true} 
          icon={AlertTriangle} 
          color="bg-medium" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Tactical Event Trend</CardTitle>
            <CardDescription>Daily event volume vs cumulative risk score</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937" }}
                  itemStyle={{ color: "#f9fafb" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="events" 
                  stroke="#3B82F6" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2 }} 
                  activeDot={{ r: 6 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="risk" 
                  stroke="#EF4444" 
                  strokeWidth={2} 
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Risk Distribution</CardTitle>
            <CardDescription>Event volume by severity level</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Events by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#9ca3af" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Hotspot Activity</CardTitle>
            <CardDescription>Top 5 regions with highest alert volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Kharkiv Oblast", country: "Ukraine", count: 124, risk: "critical" },
                { name: "Red Sea Sector", country: "Yemen", count: 86, risk: "high" },
                { name: "Rafah Region", country: "Gaza", count: 72, risk: "critical" },
                { name: "Taipei District", country: "Taiwan", count: 45, risk: "medium" },
                { name: "Sudan Border", country: "Sudan", count: 38, risk: "high" },
              ].map((hotspot) => (
                <div key={hotspot.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-primary/20 transition-colors">
                  <div>
                    <div className="text-sm font-bold">{hotspot.name}</div>
                    <div className="text-xs text-muted-foreground">{hotspot.country}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-bold">{hotspot.count}</div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Alerts</div>
                    </div>
                    <div className={`w-2 h-8 rounded-full ${
                      hotspot.risk === 'critical' ? 'bg-critical' : 
                      hotspot.risk === 'high' ? 'bg-high' : 'bg-medium'
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
