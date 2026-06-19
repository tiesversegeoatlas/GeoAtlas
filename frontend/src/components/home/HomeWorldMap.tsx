"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoEvent } from "@/types";

function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.setView([22, 5], 2, { animate: false });
    map.invalidateSize();
  }, [map]);
  return null;
}

function markerIcon(event: GeoEvent) {
  const color = event.riskLevel === "critical"
    ? "#ff4f5e"
    : event.riskLevel === "high"
      ? "#ff8138"
      : event.riskLevel === "medium"
        ? "#f2c94c"
        : "#62d68b";
  return new L.DivIcon({
    className: "atlas-map-marker",
    html: `<span style="--marker:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function HomeWorldMap({ events }: { events: GeoEvent[] }) {
  const mappedEvents = useMemo(
    () => events.filter((event) => event.latitude !== 0 || event.longitude !== 0).slice(0, 40),
    [events],
  );

  return (
    <MapContainer
      center={[22, 5]}
      zoom={2}
      minZoom={2}
      maxZoom={7}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom
      className="atlas-world-map"
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />
      {mappedEvents.map((event) => (
        <Marker
          key={event.id}
          position={[event.latitude, event.longitude]}
          icon={markerIcon(event)}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            <strong>{event.title}</strong>
            <span>{event.country}</span>
          </Tooltip>
        </Marker>
      ))}
      <FitWorld />
    </MapContainer>
  );
}
