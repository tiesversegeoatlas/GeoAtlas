import { EventCategory, EventPage, GeoEvent, NewsSource, OverviewAnalytics, RiskLevel } from "@/types";

type BackendSource = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
  reliability_score: number;
  credibility_score?: number;
  credibility_tier?: string;
};

type BackendLocation = {
  name: string;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence?: number | null;
};

type BackendWebSource = {
  title: string;
  url: string;
};

type BackendItem = {
  id: string;
  source: BackendSource;
  canonical_url: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  image_url: string | null;
  published_at: string | null;
  collected_at: string;
  category_hints: string[] | null;
  location_hints: BackendLocation[] | null;
  locations: BackendLocation[];
  extraction_status: string;
  risk_level?: string | null;
  risk_score?: number | null;
  urgency_score?: number | null;
  importance_score?: number | null;
  claim_quality_score?: number | null;
  is_breaking?: boolean;
  breaking_reason?: string | null;
  credibility_score?: number;
  rank_score?: number;
  ai_enriched_fields?: string[];
  ai_applied?: boolean;
  ai_provider?: string | null;
  ai_model?: string | null;
  ai_confidence?: number | null;
  ai_status?: string | null;
  ai_summary?: string | null;
  ai_generated_content?: string | null;
  ai_location?: BackendLocation | null;
  web_sources?: BackendWebSource[];
};

type BackendItemsResponse = {
  items: BackendItem[];
  total: number;
  offset: number;
  limit: number;
  next_cursor: string | null;
};

type BackendPublicSource = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
  credibility_score: number;
  credibility_tier: string;
  ai_credibility_score?: number | null;
  ai_assessment_count?: number;
};

type BackendOverview = {
  total_news: number;
  high_risk_events: number;
  countries_affected: number;
  policy_events: number;
  overall_risk: number;
  timeline: OverviewAnalytics["timeline"];
  breakdown: OverviewAnalytics["breakdown"];
  generated_at: string;
};

const API_ROOT = "/api/geoatlas/api/v1/public";

function mapRisk(value?: string | null): RiskLevel {
  if (value === "critical" || value === "high" || value === "medium") return value;
  return "low";
}

function mapCategory(values: string[] | null): EventCategory {
  const category = (values?.[0] || "political").toLowerCase();
  const aliases: Record<string, EventCategory> = {
    natural_disaster: "disaster",
    earthquake: "disaster",
    flood: "disaster",
    wildfire: "disaster",
    cyclone: "disaster",
    infrastructure: "political",
  };
  if (aliases[category]) return aliases[category];
  const supported: EventCategory[] = ["war", "conflict", "dispute", "terrorism", "cyber", "unrest", "disaster", "political", "military", "humanitarian"];
  if (supported.includes(category as EventCategory)) return category as EventCategory;
  if (category.includes("war") || category.includes("conflict")) return "conflict";
  if (category.includes("military") || category.includes("defence")) return "military";
  if (category.includes("disaster") || category.includes("climate")) return "disaster";
  if (category.includes("humanitarian") || category.includes("health")) return "humanitarian";
  return "political";
}

export function mapItem(item: BackendItem): GeoEvent {
  const location = item.locations[0] || item.location_hints?.[0];
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const confidence = Number(location?.confidence);
  const riskLevel = mapRisk(
    item.risk_level ||
    (item.category_hints?.some((value) => ["conflict", "armed_conflict", "cyber"].includes(value))
      ? "high"
      : item.category_hints?.some((value) => ["natural_disaster", "earthquake", "flood", "wildfire", "cyclone"].includes(value))
        ? "medium"
        : "low"),
  );
  const fallbackRiskScore = { critical: 95, high: 78, medium: 55, low: 28 }[riskLevel];
  const originalUrl = item.canonical_url || item.source.site_url || item.source.feed_url;
  return {
    id: item.id,
    title: item.title,
    summary: item.summary || item.body?.slice(0, 240) || "No summary is available.",
    description: item.body || item.summary || "No article body is available.",
    country: location?.name || "Location unconfirmed",
    region: location?.country_code || location?.name || "Global",
    latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0,
    category: mapCategory(item.category_hints),
    riskLevel,
    riskScore: item.risk_score ?? fallbackRiskScore,
    urgencyScore: item.urgency_score ?? fallbackRiskScore,
    importanceScore: item.importance_score ?? fallbackRiskScore,
    isBreaking: Boolean(item.is_breaking),
    breakingReason: item.breaking_reason || undefined,
    verificationStatus: item.extraction_status.includes("enriched") || item.extraction_status === "url_scraped"
      ? "verified"
      : "investigating",
    timestamp: item.published_at || item.collected_at,
    lastUpdated: item.collected_at,
    timeline: [],
    sources: [
      {
        name: item.source.name,
        url: originalUrl,
        reliability: Math.round(
          item.source.credibility_score ?? item.source.reliability_score * 100,
        ),
      },
      ...(item.web_sources || [])
        .filter((source) => source.url !== originalUrl)
        .map((source) => ({ name: source.title, url: source.url })),
    ],
    confidenceScore: Number.isFinite(confidence)
      ? Math.round(confidence * 100)
      : Math.round(
          item.source.credibility_score ?? item.source.reliability_score * 100,
        ),
    relatedEventIds: [],
    imageUrl: item.image_url || undefined,
    canonicalUrl: item.canonical_url || undefined,
    sourceId: item.source.id,
    aiApplied: Boolean(item.ai_applied),
    aiProvider: item.ai_provider || undefined,
    aiModel: item.ai_model || undefined,
    aiConfidence: item.ai_confidence == null
      ? undefined
      : Math.round(item.ai_confidence * 100),
    aiStatus: item.ai_status || undefined,
    aiEnrichedFields: item.ai_enriched_fields || [],
    aiSummary: item.ai_summary || undefined,
    aiGeneratedContent: item.ai_generated_content || undefined,
    aiLocation: item.ai_location ? {
      name: item.ai_location.name,
      countryCode: item.ai_location.country_code || undefined,
      latitude: item.ai_location.latitude ?? undefined,
      longitude: item.ai_location.longitude ?? undefined,
      confidence: item.ai_location.confidence ?? undefined,
    } : undefined,
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GeoAtlas API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchEvents(limit = 40): Promise<GeoEvent[]> {
  return (await fetchEventPage({ limit, includeBody: false, deduplicate: true })).events;
}

export async function fetchEvent(id: string): Promise<GeoEvent> {
  return mapItem(await request<BackendItem>(`/items/${encodeURIComponent(id)}`));
}

export async function fetchEventPage({
  limit = 50,
  offset = 0,
  includeBody = false,
  deduplicate = false,
}: {
  limit?: number;
  offset?: number;
  includeBody?: boolean;
  deduplicate?: boolean;
} = {}): Promise<EventPage> {
  const data = await request<BackendItemsResponse>(
    `/items?limit=${limit}&offset=${offset}&include_body=${includeBody}&deduplicate=${deduplicate}`,
  );
  return {
    events: data.items.map(mapItem),
    total: data.total,
    offset: data.offset,
    limit: data.limit,
    nextOffset: data.next_cursor ? Number(data.next_cursor) : null,
  };
}

export async function fetchNewsSources(): Promise<NewsSource[]> {
  const sources = await request<BackendPublicSource[]>("/sources");
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    feedUrl: source.feed_url,
    siteUrl: source.site_url || undefined,
    credibilityScore: source.credibility_score,
    credibilityTier: source.credibility_tier,
    aiCredibilityScore: source.ai_credibility_score ?? undefined,
    aiAssessmentCount: source.ai_assessment_count ?? 0,
  }));
}

export async function fetchOverview(): Promise<OverviewAnalytics> {
  const overview = await request<BackendOverview>("/overview");
  return {
    totalNews: overview.total_news,
    highRiskEvents: overview.high_risk_events,
    countriesAffected: overview.countries_affected,
    policyEvents: overview.policy_events,
    overallRisk: overview.overall_risk,
    timeline: overview.timeline,
    breakdown: overview.breakdown,
    generatedAt: overview.generated_at,
  };
}
