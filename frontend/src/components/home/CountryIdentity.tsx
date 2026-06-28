"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type CountryFeature = {
  properties: {
    ADMIN?: string;
    ISO_A2?: string;
    ISO_A2_EH?: string;
    boundary_source?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

let featureCache: CountryFeature[] | null = null;
let featurePromise: Promise<CountryFeature[]> | null = null;

function loadFeatures() {
  if (featureCache) return Promise.resolve(featureCache);
  if (!featurePromise) {
    featurePromise = fetch("/map-countries.geojson")
      .then((response) => response.json())
      .then((data) => {
        featureCache = data.features as CountryFeature[];
        const india = featureCache.find((feature) =>
          feature.properties.boundary_source === "Bhuvan NRSC admin.india_state"
        );
        if (!india) {
          throw new Error("Bhuvan/NRSC India boundary is missing.");
        }
        return featureCache;
      });
  }
  return featurePromise;
}

export function normalizeCountryCode(value?: string | null) {
  const code = (value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function countryNameFromCode(code?: string | null, fallback = "Unknown country") {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return fallback;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || fallback;
  } catch {
    return fallback;
  }
}

export function CountryFlag({
  code,
  name,
  className = "",
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  const normalized = normalizeCountryCode(code);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [normalized]);

  if (!normalized || failed) {
    return <span className={`atlas-country-flag-fallback ${className}`}>{normalized || name.slice(0, 2).toUpperCase()}</span>;
  }
  return (
    <span className={`atlas-country-flag ${className}`}>
      <Image
        src={`/flags/${normalized.toLowerCase()}.svg`}
        alt={`${name} flag`}
        width={66}
        height={44}
        unoptimized
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

// Legacy compact path retained for compatibility. Geographic map/profile
// rendering now uses /map-countries.geojson, whose India feature comes from
// the official Bhuvan/NRSC admin.india_state vector tiles.
export const INDIA_BHUVAN_PATH =
  "M6.5 71.4 L6.4 73.5 L8.1 74.8 L11.2 74.4 L11.5 73.5 L13.6 73.5 L11.1 75.8 L8.0 76.9 L8.1 76.2 L7.6 76.0 L7.3 76.5 L12.5 81.6 L17.1 80.2 L17.7 78.8 L17.4 77.7 L18.4 76.8 L18.8 76.8 L18.4 78.7 L19.5 82.3 L18.7 84.7 L21.2 96.9 L30.7 119.5 L33.9 122.1 L38.9 118.3 L39.2 115.3 L39.5 115.1 L40.6 115.2 L41.0 115.2 L42.3 98.1 L48.4 95.3 L56.5 86.5 L61.1 84.3 L62.3 83.0 L62.2 82.4 L63.1 81.9 L62.6 79.8 L65.4 78.6 L66.2 76.9 L66.8 79.0 L67.4 78.9 L67.5 77.9 L67.8 78.1 L68.0 77.5 L68.3 79.0 L69.4 78.8 L68.3 69.9 L66.1 68.6 L69.2 66.6 L66.4 64.7 L67.2 61.9 L70.2 64.0 L70.9 64.2 L71.1 63.8 L71.1 63.7 L70.9 63.6 L70.9 63.5 L71.1 63.5 L71.1 63.3 L71.2 63.3 L71.8 66.5 L79.7 67.4 L75.7 72.2 L76.4 74.0 L77.2 74.4 L79.2 71.8 L81.2 77.7 L82.4 70.6 L85.0 71.3 L88.1 61.9 L91.6 59.6 L94.2 60.3 L95.0 56.5 L91.4 55.7 L92.6 54.4 L90.9 52.0 L88.9 53.5 L86.5 52.4 L80.1 57.8 L77.0 57.6 L78.5 61.2 L69.5 61.3 L68.6 57.1 L66.5 57.3 L66.1 62.8 L49.8 58.9 L41.6 54.3 L44.6 49.2 L38.1 45.6 L36.7 42.0 L40.2 40.3 L38.1 35.7 L41.6 33.0 L42.3 29.6 L39.4 28.1 L33.4 30.1 L25.0 23.9 L20.1 25.4 L18.5 27.1 L18.3 28.3 L23.3 31.4 L21.2 33.5 L21.1 34.3 L21.7 36.0 L21.6 38.0 L21.8 38.9 L27.2 42.1 L24.7 43.5 L25.1 46.3 L16.4 57.3 L11.7 57.1 L9.3 60.1 L14.1 69.5 L6.9 69.8 L5.0 72.3 L6.5 71.4 Z M66.5 78.0 L66.2 78.7 L66.5 78.8 L66.5 78.0 Z M68.0 78.3 L67.7 78.2 L67.6 78.4 L67.9 78.8 L68.0 78.3 Z M79.9 110.4 L80.6 111.4 L81.4 108.2 L81.3 107.1 L81.2 106.9 L81.0 106.9 L81.5 106.5 L81.7 105.6 L81.5 104.8 L80.9 105.4 L80.5 107.9 L80.6 108.9 L79.9 110.1 L79.9 110.4 Z M81.3 109.5 L81.2 109.8 L81.6 110.2 L81.7 109.1 L81.3 109.3 L81.3 109.5 Z M79.9 113.3 L79.5 114.4 L80.0 114.5 L80.2 113.6 L80.0 113.3 L79.9 113.3 Z M82.9 122.7 L82.4 122.3 L82.4 122.5 L82.9 122.7 Z M83.9 126.1 L84.3 125.6 L84.0 124.7 L83.4 125.0 L83.9 126.1 Z";

export function CountryShape({
  code,
  name,
  className = "",
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  const normalized = normalizeCountryCode(code);
  const [features, setFeatures] = useState<CountryFeature[]>(featureCache || []);

  useEffect(() => {
    void loadFeatures().then(setFeatures);
  }, []);

  const path = useMemo(() => {
    const feature = features.find((candidate) => {
      const properties = candidate.properties;
      if (normalized === "IN") {
        return properties.boundary_source === "Bhuvan NRSC admin.india_state";
      }
      return properties.ISO_A2_EH === normalized
        || properties.ISO_A2 === normalized
        || properties.ADMIN?.toLowerCase() === name.toLowerCase();
    });
    return feature ? geometryPath(feature.geometry) : null;
  }, [features, name, normalized]);

  return (
    <svg
      className={`atlas-country-shape ${className}`}
      viewBox="0 0 100 150"
      role="img"
      aria-label={`${name} outline`}
    >
      {path
        ? <path d={path} />
        : <path d="M50 7 C73 8 89 29 88 55 C87 83 74 123 50 143 C26 123 13 83 12 55 C11 29 27 8 50 7 Z" />}
    </svg>
  );
}

function geometryPath(geometry: CountryFeature["geometry"]) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  const points = polygons.flat(2);
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);
  const scale = Math.min(86 / width, 132 / height);
  const offsetX = (100 - width * scale) / 2;
  const offsetY = (150 - height * scale) / 2;

  return polygons.map((polygon) => polygon.map((ring) => {
    return ring.map((point, index) => {
      const x = offsetX + (point[0] - minX) * scale;
      const y = 150 - (offsetY + (point[1] - minY) * scale);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ") + " Z";
  }).join(" ")).join(" ");
}
