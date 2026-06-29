import { parseTimestamp } from "@/lib/date-time";
import { EventCategory, EventPage, GeoEvent, NewsSource, OverviewAnalytics, RiskLevel } from "@/types";

type BackendSource = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
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

function sanitizeDisplayText(value?: string | null): string {
  return (value || "")
    .replace(/\s*\(\s*\[[^\]]*]\(\s*https?:\/\/[^)]+\)\s*\)/gi, "")
    .replace(/!\[([^\]]*)]\(\s*https?:\/\/[^)]+\)/gi, "$1")
    .replace(/\[([^\]]+)]\(\s*https?:\/\/[^)]+\)/gi, (_, label: string) =>
      /^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(label.trim())
        ? ""
        : label,
    )
    .replace(/<?https?:\/\/[^\s<>\])}]+>?/gi, "")
    .replace(/\b(?:AI|artificial intelligence)[ -](?:generated|written|created|produced)\b/gi, "")
    .replace(/\bAI\s+(?=(?:analysis|review|summary|content|response|assistant|model|system)\b)/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeDisplayUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].forEach((key) => {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "ocid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    });
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function timestampMs(value?: string | null): number {
  if (!value) return Number.NaN;
  return parseTimestamp(value).getTime();
}

function resolveOperationalTimestamp(
  publishedAt?: string | null,
  collectedAt?: string | null,
): string {
  const publishedMs = timestampMs(publishedAt);
  const collectedMs = timestampMs(collectedAt);
  const now = Date.now();
  const hasPublished = Number.isFinite(publishedMs);
  const hasCollected = Number.isFinite(collectedMs);

  if (hasPublished) {
    const aheadOfNow = publishedMs > now + 5 * 60 * 1000;
    const aheadOfCollection = hasCollected && publishedMs > collectedMs + 15 * 60 * 1000;
    if (!aheadOfNow && !aheadOfCollection) {
      return publishedAt as string;
    }
  }

  if (hasCollected) {
    return collectedAt as string;
  }

  if (publishedAt) {
    return publishedAt;
  }

  return new Date(now).toISOString();
}

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
  const originalUrl = sanitizeDisplayUrl(
    item.canonical_url || item.source.site_url || item.source.feed_url,
  ) || "";
  const summary = sanitizeDisplayText(
    item.summary || item.body?.slice(0, 240) || "No summary is available.",
  );
  const description = sanitizeDisplayText(
    item.body || item.summary || "No article body is available.",
  );
  const operationalTimestamp = resolveOperationalTimestamp(
    item.published_at,
    item.collected_at,
  );
  return {
    id: item.id,
    title: sanitizeDisplayText(item.title) || "Untitled report",
    summary: summary || "No summary is available.",
    description: description || "No article body is available.",
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
    breakingReason: sanitizeDisplayText(item.breaking_reason) || undefined,
    verificationStatus: item.extraction_status.includes("enriched") || item.extraction_status === "url_scraped"
      ? "verified"
      : "investigating",
    timestamp: operationalTimestamp,
    lastUpdated: item.collected_at,
    timeline: [],
    sources: [
      {
        name: item.source.name,
        url: originalUrl,
        reliability: Math.round(
        item.source.credibility_score ?? 50,
        ),
      },
    ],
    confidenceScore: Number.isFinite(confidence)
      ? Math.round(confidence * 100)
      : Math.round(
          item.source.credibility_score ?? 50,
        ),
    relatedEventIds: [],
    imageUrl: sanitizeDisplayUrl(item.image_url),
    canonicalUrl: sanitizeDisplayUrl(item.canonical_url),
    sourceId: item.source.id,
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GeoAtlas API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchEvents(limit = 100): Promise<GeoEvent[]> {
  return (
    await fetchEventPage({
      limit,
      includeBody: true,
      deduplicate: false,
      sinceHours: 24,
    })
  ).events;
}

export async function fetchEvent(id: string): Promise<GeoEvent> {
  return mapItem(await request<BackendItem>(`/items/${encodeURIComponent(id)}`));
}

export async function fetchEventPage({
  limit = 50,
  offset = 0,
  includeBody = false,
  deduplicate = false,
  sinceHours,
}: {
  limit?: number;
  offset?: number;
  includeBody?: boolean;
  deduplicate?: boolean;
  sinceHours?: number;
} = {}): Promise<EventPage> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    include_body: String(includeBody),
    deduplicate: String(deduplicate),
  });
  if (sinceHours !== undefined) {
    query.set("since_hours", String(sinceHours));
  }
  const data = await request<BackendItemsResponse>(
    `/items?${query.toString()}`,
  );
  return {
    events: data.items
      .map(mapItem)
      .sort(
        (left, right) =>
          parseTimestamp(right.timestamp).getTime()
          - parseTimestamp(left.timestamp).getTime(),
      ),
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
