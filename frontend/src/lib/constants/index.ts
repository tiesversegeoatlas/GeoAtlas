import { RiskLevel, EventCategory } from "@/types";

export const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#F59E0B",
  low: "#22C55E",
};

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  war: "War",
  conflict: "Armed Conflict",
  dispute: "Border Dispute",
  terrorism: "Terrorism",
  cyber: "Cyber Attack",
  unrest: "Civil Unrest",
  disaster: "Natural Disaster",
  political: "Political Instability",
  military: "Military Movement",
  humanitarian: "Humanitarian Crisis",
};

export const REGIONS = [
  "North America",
  "South America",
  "Western Europe",
  "Eastern Europe",
  "Middle East",
  "Central Asia",
  "East Asia",
  "South Asia",
  "Southeast Asia",
  "North Africa",
  "Sub-Saharan Africa",
  "Oceania",
  "Arctic",
  "Antarctic",
  "Sahel"
];
