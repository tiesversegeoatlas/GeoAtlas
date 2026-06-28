"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AtlasSectionShell } from "@/components/intelligence/AtlasSectionShell";
import { RiskAnalytics } from "@/components/intelligence/RiskAnalytics";
import { useEventStore } from "@/stores/eventStore";

const HomeWorldMap = dynamic(() => import("@/components/home/HomeWorldMap"), { ssr: false });

export default function LiveMapPage() {
  const router = useRouter();
  const { events, loading, error, loadEvents } = useEventStore();
  useEffect(() => { void loadEvents(); }, [loadEvents]);
  return (
    <AtlasSectionShell title="Live Intelligence Map" subtitle="Geolocated events from the latest collected database records.">
      <section className="atlas-live-map-page">
        <div className="atlas-card atlas-live-map-surface">
          <HomeWorldMap events={events} layer="dark" zoomCommand={0} onSelect={(event) => router.push(`/events/${event.id}`)} />
          <div className="atlas-map-page-status">{loading ? "Synchronizing…" : error ? error : `${events.length} events displayed`}</div>
        </div>
        <aside className="atlas-card atlas-map-event-rail">
          <div className="atlas-section-title"><h2>Located intelligence</h2><button onClick={() => void loadEvents(true)}>Refresh</button></div>
          {events.slice(0, 12).map((event) => (
            <Link href={`/events/${event.id}`} key={event.id}>
              <i className={event.riskLevel} /><span><strong>{event.title}</strong><small>{event.country} · {event.riskScore}/100</small></span>
            </Link>
          ))}
          <RiskAnalytics events={events} compact />
        </aside>
      </section>
    </AtlasSectionShell>
  );
}
