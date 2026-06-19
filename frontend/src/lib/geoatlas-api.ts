import { EventCategory, GeoEvent, RiskLevel } from "@/types";

type BackendSource = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
  reliability_score: number;
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
};

type BackendItemsResponse = {
  items: BackendItem[];
};

const API_ROOT = "/api/geoatlas/api/v1/public";

function mapRisk(value?: string | null): RiskLevel {
  if (value === "critical" || value === "high" || value === "medium") return value;
  return "low";
}

function mapCategory(values: string[] | null): EventCategory {
  const category = values?.[0] || "political";
  const aliases: Record<string, EventCategory> = {
    natural_disaster: "disaster",
    earthquake: "disaster",
    flood: "disaster",
    wildfire: "disaster",
    cyclone: "disaster",
    infrastructure: "political",
  };
  return aliases[category] || (category as EventCategory);
}

function mapItem(item: BackendItem): GeoEvent {
  const location = item.locations[0] || item.location_hints?.[0];
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const confidence = Number(location?.confidence);
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
    riskLevel: mapRisk(
      item.category_hints?.some((value) => ["conflict", "cyber"].includes(value))
        ? "high"
        : item.category_hints?.some((value) => ["natural_disaster", "earthquake", "flood", "wildfire", "cyclone"].includes(value))
          ? "medium"
          : "low",
    ),
    verificationStatus: item.extraction_status.includes("enriched") || item.extraction_status === "url_scraped"
      ? "verified"
      : "investigating",
    timestamp: item.published_at || item.collected_at,
    lastUpdated: item.collected_at,
    timeline: [],
    sources: [{
      name: item.source.name,
      url: item.canonical_url || item.source.site_url || item.source.feed_url,
      reliability: Math.round(item.source.reliability_score * 100),
    }],
    confidenceScore: Number.isFinite(confidence)
      ? Math.round(confidence * 100)
      : Math.round(item.source.reliability_score * 100),
    relatedEventIds: [],
    imageUrl: item.image_url || undefined,
    canonicalUrl: item.canonical_url || undefined,
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
  const data = await request<BackendItemsResponse>(`/items?limit=${limit}`);
  return data.items.map(mapItem);
}

export async function fetchEvent(id: string): Promise<GeoEvent> {
  return mapItem(await request<BackendItem>(`/items/${encodeURIComponent(id)}`));
}
