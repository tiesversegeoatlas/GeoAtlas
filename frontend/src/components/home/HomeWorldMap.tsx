"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON as LeafletGeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { FeatureCollection, Geometry } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoEvent } from "@/types";
import { isWithinHours } from "@/lib/date-time";

type BoundaryCollection = FeatureCollection<Geometry, {
  ADMIN?: string;
  ISO_A2?: string;
  ISO_A2_EH?: string;
  boundary_source?: string;
}>;

type AdminBoundaryCollection = FeatureCollection<Geometry, {
  name?: string;
  admin?: string;
  iso_3166_2?: string;
  type?: string;
}>;

const ADMIN_BOUNDARY_URL =
  "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_1_states_provinces_shp.geojson";

const COUNTRY_ALIASES: Record<string, string> = {
  "america": "US",
  "great britain": "GB",
  "russian federation": "RU",
  "u k": "GB",
  "u s": "US",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
};

const ADMIN_REGION_COUNTRIES: Record<string, string> = Object.fromEntries([
  ...[
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Hawaii", "Idaho", "Illinois",
    "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
  ].map((name) => [name.toLowerCase(), "US"]),
  ...[
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
    "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
  ].map((name) => [name.toLowerCase(), "IN"]),
  ...[
    "Alberta", "British Columbia", "Manitoba", "New Brunswick",
    "Newfoundland and Labrador", "Nova Scotia", "Ontario",
    "Prince Edward Island", "Quebec", "Saskatchewan",
  ].map((name) => [name.toLowerCase(), "CA"]),
  ...[
    "New South Wales", "Queensland", "South Australia", "Tasmania",
    "Victoria", "Western Australia", "Australian Capital Territory",
    "Northern Territory",
  ].map((name) => [name.toLowerCase(), "AU"]),
]);

let boundaryCache: BoundaryCollection | null = null;
let boundaryPromise: Promise<BoundaryCollection> | null = null;
let adminBoundaryCache: AdminBoundaryCollection | null = null;
let adminBoundaryPromise: Promise<AdminBoundaryCollection> | null = null;

function loadBoundaries() {
  if (boundaryCache) return Promise.resolve(boundaryCache);
  if (!boundaryPromise) {
    boundaryPromise = fetch("/map-countries.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Country boundary data is unavailable.");
        return response.json() as Promise<BoundaryCollection>;
      })
      .then((data) => {
        const india = data.features.find((feature) =>
          feature.properties?.boundary_source === "Bhuvan NRSC admin.india_state"
        );
        if (!india) {
          throw new Error("Bhuvan/NRSC India boundary is missing.");
        }
        boundaryCache = data;
        return data;
      });
  }
  return boundaryPromise;
}

function loadAdminBoundaries() {
  if (adminBoundaryCache) return Promise.resolve(adminBoundaryCache);
  if (!adminBoundaryPromise) {
    adminBoundaryPromise = fetch(ADMIN_BOUNDARY_URL)
      .then((response) => {
        if (!response.ok) throw new Error("State boundary data is unavailable.");
        return response.json() as Promise<AdminBoundaryCollection>;
      })
      .then((data) => {
        adminBoundaryCache = data;
        return data;
      });
  }
  return adminBoundaryPromise;
}

function MapController({
  mapCommand,
  focus,
}: {
  mapCommand: { action: "idle" | "reset" | "zoom-in" | "zoom-out"; nonce: number };
  focus: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (focus) {
      map.flyTo(focus, Math.max(map.getZoom(), 4));
      return;
    }
    if (mapCommand.action === "reset") {
      map.setView([22, 5], 2, { animate: true });
      return;
    }
    if (mapCommand.action === "zoom-in") {
      map.zoomIn();
      return;
    }
    if (mapCommand.action === "zoom-out") {
      map.zoomOut();
    }
  }, [focus, map, mapCommand]);
  return null;
}

function MapZoomObserver({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

function markerIcon(event: GeoEvent, count: number) {
  const color = riskColor(event.riskLevel);
  return new L.DivIcon({
    className: "atlas-map-marker",
    html: `<span class="${count > 1 ? "clustered" : ""}" style="--marker:${color}">${count > 1 ? `<b>${count}</b>` : ""}</span>`,
    iconSize: count > 1 ? [26, 26] : [18, 18],
    iconAnchor: count > 1 ? [13, 13] : [9, 9],
  });
}

function riskColor(risk: GeoEvent["riskLevel"]) {
  return risk === "critical"
    ? "#ff4f5e"
    : risk === "high"
      ? "#ff8138"
      : risk === "medium"
        ? "#f2c94c"
        : "#62d68b";
}

function normalizePlace(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function clusterCellSize(zoom: number) {
  if (zoom <= 2) return 12;
  if (zoom === 3) return 6;
  if (zoom === 4) return 3;
  if (zoom === 5) return 1.5;
  if (zoom === 6) return 0.65;
  if (zoom === 7) return 0.25;
  if (zoom === 8) return 0.1;
  if (zoom === 9) return 0.04;
  return 0.015;
}

function MarkerNewsCard({
  representative,
  count,
  onOpen,
}: {
  representative: GeoEvent;
  count: number;
  onOpen?: (event: GeoEvent) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [representative.imageUrl]);
  return (
    <article className="atlas-marker-news-card">
      {representative.imageUrl && !imageFailed && (
        <Image
          src={representative.imageUrl}
          alt=""
          width={320}
          height={150}
          unoptimized
          onError={() => setImageFailed(true)}
        />
      )}
      <div>
        <span className={`atlas-marker-news-risk ${representative.riskLevel}`}>
          {representative.isBreaking ? "BREAKING · " : ""}
          {representative.riskLevel} risk
        </span>
        <h3>{representative.title}</h3>
        <p>{representative.summary}</p>
        <small>
          {representative.country}
          {count > 1 ? ` · ${count} reports nearby` : ""}
        </small>
        {onOpen && (
          <button type="button" onClick={() => onOpen(representative)}>
            Open report
          </button>
        )}
      </div>
    </article>
  );
}

export default function HomeWorldMap({
  events,
  layer = "dark",
  mapCommand = { action: "idle", nonce: 0 },
  focus = null,
  onSelect,
}: {
  events: GeoEvent[];
  layer?: "dark" | "light";
  mapCommand?: { action: "idle" | "reset" | "zoom-in" | "zoom-out"; nonce: number };
  focus?: [number, number] | null;
  onSelect?: (event: GeoEvent) => void;
}) {
  const [boundaries, setBoundaries] = useState<BoundaryCollection | null>(boundaryCache);
  const [adminBoundaries, setAdminBoundaries] = useState<AdminBoundaryCollection | null>(adminBoundaryCache);
  const [mapZoom, setMapZoom] = useState(2);
  const recentEvents = useMemo(
    () => events.filter((event) => isWithinHours(event.timestamp, 24)),
    [events],
  );
  const mappedClusters = useMemo(() => {
    const cellSize = clusterCellSize(mapZoom);
    const priority: Record<GeoEvent["riskLevel"], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    const clusters = new Map<string, {
      events: GeoEvent[];
      latitudeTotal: number;
      longitudeTotal: number;
      representative: GeoEvent;
    }>();
    for (const event of recentEvents) {
      if (event.latitude === 0 && event.longitude === 0) continue;
      const key = `${Math.round(event.latitude / cellSize)}:${Math.round(event.longitude / cellSize)}`;
      const current = clusters.get(key);
      if (!current) {
        clusters.set(key, {
          events: [event],
          latitudeTotal: event.latitude,
          longitudeTotal: event.longitude,
          representative: event,
        });
        continue;
      }
      current.events.push(event);
      current.latitudeTotal += event.latitude;
      current.longitudeTotal += event.longitude;
      const candidateRank = (event.isBreaking ? 10 : 0) + priority[event.riskLevel];
      const currentRank = (current.representative.isBreaking ? 10 : 0)
        + priority[current.representative.riskLevel];
      if (candidateRank > currentRank) current.representative = event;
    }
    return Array.from(clusters.entries(), ([key, cluster]) => ({
      key,
      ...cluster,
      latitude: cluster.latitudeTotal / cluster.events.length,
      longitude: cluster.longitudeTotal / cluster.events.length,
    }));
  }, [mapZoom, recentEvents]);

  useEffect(() => {
    void loadBoundaries().then(setBoundaries);
    void loadAdminBoundaries().then(setAdminBoundaries).catch(() => {
      // Country-level name highlighting remains available as a fallback.
    });
  }, []);

  const boundaryLayers = useMemo(() => {
    if (!boundaries) return null;
    const india = boundaries.features.find((feature) =>
      feature.properties?.boundary_source === "Bhuvan NRSC admin.india_state"
    );
    return {
      countries: {
        ...boundaries,
        features: boundaries.features.filter((feature) => feature !== india),
      } as BoundaryCollection,
      india: india
        ? { type: "FeatureCollection", features: [india] } as BoundaryCollection
        : null,
    };
  }, [boundaries]);

  const highlightedCountries = useMemo(() => {
    const highlights = new Map<string, {
      count: number;
      risk: GeoEvent["riskLevel"];
    }>();
    if (!boundaries) return highlights;
    const countryNames = new Map<string, string>();
    for (const feature of boundaries.features) {
      const code = feature.properties?.ISO_A2_EH || feature.properties?.ISO_A2;
      const name = feature.properties?.ADMIN;
      if (code && name) countryNames.set(normalizePlace(name), code);
    }
    const priority: Record<GeoEvent["riskLevel"], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    for (const event of recentEvents) {
      const codes = new Set<string>();
      for (const rawValue of [event.region, event.country]) {
        const raw = rawValue.trim();
        if (/^[A-Za-z]{2}$/.test(raw)) codes.add(raw.toUpperCase());
        const parts = [raw, ...raw.split(",")].map(normalizePlace).filter(Boolean);
        for (const part of parts) {
          const countryCode = countryNames.get(part) || COUNTRY_ALIASES[part];
          if (countryCode) {
            codes.add(countryCode);
            continue;
          }
          const parentCode = ADMIN_REGION_COUNTRIES[part];
          if (parentCode) codes.add(parentCode);
        }
      }
      for (const code of codes) {
        const current = highlights.get(code);
        highlights.set(code, {
          count: (current?.count || 0) + 1,
          risk: !current || priority[event.riskLevel] > priority[current.risk]
            ? event.riskLevel
            : current.risk,
        });
      }
    }
    return highlights;
  }, [boundaries, recentEvents]);

  const highlightedAdminRegions = useMemo(() => {
    const highlights = new Map<string, GeoEvent["riskLevel"]>();
    if (!adminBoundaries || !boundaries) return highlights;
    const countryNames = new Set(
      boundaries.features
        .map((feature) => feature.properties?.ADMIN)
        .filter((name): name is string => Boolean(name))
        .map(normalizePlace),
    );
    const availableRegions = new Set(
      adminBoundaries.features
        .map((feature) => feature.properties?.name)
        .filter((name): name is string => Boolean(name))
        .map(normalizePlace),
    );
    const priority: Record<GeoEvent["riskLevel"], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    for (const event of recentEvents) {
      for (const rawValue of [event.region, event.country]) {
        for (const part of [rawValue, ...rawValue.split(",")].map(normalizePlace)) {
          if (!part || countryNames.has(part) || !availableRegions.has(part)) continue;
          const current = highlights.get(part);
          if (!current || priority[event.riskLevel] > priority[current]) {
            highlights.set(part, event.riskLevel);
          }
        }
      }
    }
    return highlights;
  }, [adminBoundaries, boundaries, recentEvents]);

  const highlightedAdminData = useMemo(() => {
    if (!adminBoundaries || !highlightedAdminRegions.size) return null;
    return {
      ...adminBoundaries,
      features: adminBoundaries.features.filter((feature) =>
        highlightedAdminRegions.has(normalizePlace(feature.properties?.name || ""))
      ),
    } as AdminBoundaryCollection;
  }, [adminBoundaries, highlightedAdminRegions]);

  const boundaryStyle = useMemo(() => ({
    className: "atlas-country-map-boundary",
    color: layer === "dark" ? "#66788e" : "#738398",
    fillColor: layer === "dark" ? "#292b2e" : "#e5e7e9",
    fillOpacity: 1,
    opacity: 0.95,
    weight: 0.85,
  }), [layer]);

  const featureStyle = (feature?: {
    properties?: BoundaryCollection["features"][number]["properties"];
  }) => {
    const code = feature?.properties?.ISO_A2_EH || feature?.properties?.ISO_A2;
    const highlight = code ? highlightedCountries.get(code) : undefined;
    if (!highlight) return boundaryStyle;
    const color = riskColor(highlight.risk);
    return {
      ...boundaryStyle,
      color,
      fillColor: color,
      fillOpacity: layer === "dark" ? 0.52 : 0.38,
      opacity: 1,
      weight: 1.8,
    };
  };

  return (
    <MapContainer
      center={[22, 5]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom
      className="atlas-world-map"
    >
      <TileLayer
        key={layer}
        url={layer === "dark"
          ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"}
      />
      <MapZoomObserver onZoom={setMapZoom} />
      {boundaryLayers && (
        <LeafletGeoJSON
          data={boundaryLayers.countries}
          interactive={false}
          style={featureStyle}
        />
      )}
      {boundaryLayers?.india && (
        <LeafletGeoJSON
          data={boundaryLayers.india}
          interactive={false}
          style={featureStyle}
        />
      )}
      {highlightedAdminData && (
        <LeafletGeoJSON
          data={highlightedAdminData}
          interactive={false}
          style={(feature) => {
            const risk = highlightedAdminRegions.get(
              normalizePlace(feature?.properties?.name || ""),
            ) || "low";
            const color = riskColor(risk);
            return {
              color,
              fillColor: color,
              fillOpacity: layer === "dark" ? 0.72 : 0.58,
              opacity: 1,
              weight: 2.2,
            };
          }}
        />
      )}
      {mappedClusters.map((cluster) => (
        <Marker
          key={cluster.key}
          position={[cluster.latitude, cluster.longitude]}
          icon={markerIcon(cluster.representative, cluster.events.length)}
        >
          <Popup minWidth={240} maxWidth={300} autoPan>
            <MarkerNewsCard
              representative={cluster.representative}
              count={cluster.events.length}
              onOpen={onSelect}
            />
          </Popup>
        </Marker>
      ))}
      <MapController mapCommand={mapCommand} focus={focus} />
    </MapContainer>
  );
}
