"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoEvent, RiskLevel } from "@/types";
import { RISK_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MapPin, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Fix for default marker icons in Leaflet with Next.js
const createCustomIcon = (risk: RiskLevel) => {
  return new L.DivIcon({
    className: "custom-div-icon",
    html: `<div style="background-color: ${RISK_COLORS[risk]}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${RISK_COLORS[risk]};"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
  });
};

function SetViewOnSelect({ event }: { event: GeoEvent | null }) {
  const map = useMap();
  useEffect(() => {
    if (event) {
      map.setView([event.latitude, event.longitude], 8, {
        animate: true,
      });
    }
  }, [event, map]);
  return null;
}

interface MapViewProps {
  events: GeoEvent[];
  selectedEvent: GeoEvent | null;
}

export default function MapView({ events, selectedEvent }: MapViewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="w-full h-full bg-background/50 animate-pulse rounded-xl" />;

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      className="w-full h-full min-h-[600px] z-10"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {events.map((event) => (
        <Marker 
          key={event.id} 
          position={[event.latitude, event.longitude]}
          icon={createCustomIcon(event.riskLevel)}
        >
          <Popup className="custom-popup">
            <div className="p-1 min-w-[200px]">
              <div className="flex justify-between items-start mb-2">
                <Badge className={
                  event.riskLevel === 'critical' ? 'bg-critical' :
                  event.riskLevel === 'high' ? 'bg-high' :
                  event.riskLevel === 'medium' ? 'bg-medium' : 'bg-low'
                }>
                  {event.riskLevel.toUpperCase()}
                </Badge>
                <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />
                  {formatDistanceToNow(new Date(event.timestamp))}
                </div>
              </div>
              
              <h3 className="text-sm font-bold leading-tight mb-1">{event.title}</h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-3 font-medium">
                <MapPin className="w-3 h-3" />
                {event.country}
              </div>
              
              <Button asChild size="sm" className="w-full h-7 text-[10px] font-bold">
                <Link href={`/events/${event.id}`}>
                  OPEN INTELLIGENCE
                </Link>
              </Button>
            </div>
          </Popup>
        </Marker>
      ))}

      <SetViewOnSelect event={selectedEvent} />
    </MapContainer>
  );
}
