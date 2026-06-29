export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type VerificationStatus = 'verified' | 'unverified' | 'investigating';
export type EventCategory =
  | 'war'
  | 'conflict'
  | 'dispute'
  | 'terrorism'
  | 'cyber'
  | 'unrest'
  | 'disaster'
  | 'political'
  | 'military'
  | 'humanitarian';

export interface TimelineEntry {
  date: string;
  description: string;
  type?: 'milestone' | 'update' | 'source';
}

export interface Source {
  name: string;
  url: string;
  reliability?: number; // 0-100
}

export interface GeoEvent {
  id: string;
  title: string;
  summary: string;
  description: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  category: EventCategory;
  riskLevel: RiskLevel;
  riskScore: number;
  urgencyScore: number;
  importanceScore: number;
  isBreaking: boolean;
  breakingReason?: string;
  verificationStatus: VerificationStatus;
  timestamp: string;
  lastUpdated: string;
  timeline: TimelineEntry[];
  sources: Source[];
  confidenceScore: number;
  relatedEventIds: string[];
  imageUrl?: string;
  canonicalUrl?: string;
  sourceId?: string;
}

export interface EventPage {
  events: GeoEvent[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  siteUrl?: string;
  credibilityScore: number;
  credibilityTier: string;
}

export interface OverviewAnalytics {
  totalNews: number;
  highRiskEvents: number;
  countriesAffected: number;
  policyEvents: number;
  overallRisk: number;
  timeline: Array<{ date: string; label: string; risk: number; events: number }>;
  breakdown: Array<{ label: string; value: number; count: number }>;
  generatedAt: string;
}

export interface CountryProfile {
  code: string;
  name: string;
  region: string;
  riskScore: number;
  activeEventsCount: number;
  description: string;
}

export interface IntelReport {
  id: string;
  title: string;
  summary: string;
  author: string;
  date: string;
  category: EventCategory;
  tags: string[];
  restricted: boolean;
}

export interface IntelCluster {
  id: string;
  name: string;
  description: string;
  eventIds: string[];
  riskLevel: RiskLevel;
  region: string;
}

export interface DashboardStats {
  totalEvents: number;
  highRiskEvents: number;
  verifiedReports: number;
  countriesMonitored: number;
}
