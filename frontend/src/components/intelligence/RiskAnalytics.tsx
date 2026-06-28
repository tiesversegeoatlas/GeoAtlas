"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GeoEvent, OverviewAnalytics } from "@/types";
import { formatUserTime, parseTimestamp } from "@/lib/date-time";

const GROUPS = [
  ["Security", ["war", "conflict", "dispute", "terrorism", "military", "cyber"]],
  ["Political", ["political", "unrest"]],
  ["Humanitarian", ["humanitarian"]],
  ["Environmental", ["disaster"]],
] as const;

export function buildRiskAnalytics(events: GeoEvent[]) {
  const daily = new Map<string, { total: number; count: number }>();
  for (const event of events) {
    const date = parseTimestamp(event.timestamp);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const current = daily.get(key) || { total: 0, count: 0 };
    current.total += event.riskScore;
    current.count += 1;
    daily.set(key, current);
  }
  let timeline = Array.from(daily, ([date, values]) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    risk: Math.round(values.total / values.count),
    events: values.count,
  })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (timeline.length < 2 && events.length > 1) {
    timeline = [...events]
      .filter((event) => !Number.isNaN(parseTimestamp(event.timestamp).getTime()))
      .sort((left, right) => parseTimestamp(left.timestamp).getTime() - parseTimestamp(right.timestamp).getTime())
      .slice(-14)
      .map((event) => ({
        date: event.timestamp,
        label: formatUserTime(event.timestamp),
        risk: event.riskScore,
        events: 1,
      }));
  }

  const breakdown = GROUPS.map(([label, categories]) => {
    const matching = events.filter((event) => (categories as readonly string[]).includes(event.category));
    return {
      label,
      value: matching.length
        ? Math.round(matching.reduce((sum, event) => sum + event.riskScore, 0) / matching.length)
        : 0,
      count: matching.length,
    };
  });
  const overall = events.length
    ? Math.round(events.reduce((sum, event) => sum + event.riskScore, 0) / events.length)
    : 0;
  return { timeline, breakdown, overall };
}

export function RiskAnalytics({
  events,
  analytics,
  compact = false,
}: {
  events?: GeoEvent[];
  analytics?: Pick<OverviewAnalytics, "timeline" | "breakdown" | "overallRisk">;
  compact?: boolean;
}) {
  const calculated = useMemo(() => buildRiskAnalytics(events || []), [events]);
  const display = analytics
    ? { timeline: analytics.timeline, breakdown: analytics.breakdown, overall: analytics.overallRisk }
    : calculated;
  return (
    <div className={compact ? "atlas-risk-analytics compact" : "atlas-risk-analytics"}>
      <div className="atlas-real-line-chart" aria-label="Risk index timeline based on collected events">
        {display.timeline.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={display.timeline} margin={{ top: 8, right: 8, bottom: 0, left: compact ? -28 : -15 }}>
              <CartesianGrid stroke="#1a2b40" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#70839c" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="#70839c" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#091727", border: "1px solid #243a55", borderRadius: 6, fontSize: 11 }}
                formatter={(value) => [`${value}/100`, "Risk index"]}
              />
              <Line
                type="monotone"
                dataKey="risk"
                stroke="#ef4d5d"
                strokeWidth={2}
                dot={{ r: 2, fill: "#ef4d5d", strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="atlas-empty">Risk history will appear as dated events arrive.</p>}
      </div>
      <div className="atlas-risk-bars">
        {display.breakdown.map((entry, index) => (
          <div key={entry.label}>
            <span>{entry.label}</span>
            <i><b className={["red", "pink", "orange", "green"][index]} style={{ width: `${entry.value}%` }} /></i>
            <em>{entry.value}/100</em>
          </div>
        ))}
      </div>
    </div>
  );
}
