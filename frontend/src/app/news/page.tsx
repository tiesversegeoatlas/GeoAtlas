"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AtlasSectionShell } from "@/components/intelligence/AtlasSectionShell";
import { RiskAnalytics } from "@/components/intelligence/RiskAnalytics";
import { fetchEventPage, fetchNewsSources } from "@/lib/geoatlas-api";
import { formatUserDateTime } from "@/lib/date-time";
import { EventPage, GeoEvent, NewsSource } from "@/types";

export default function NewsPage() {
  const [data, setData] = useState<EventPage>({ events: [], total: 0, offset: 0, limit: 50, nextOffset: null });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [visibleSourceCount, setVisibleSourceCount] = useState(100);

  const load = async (offset = 0, append = false) => {
    setLoading(true);
    setError("");
    try {
      const page = await fetchEventPage({ limit: 50, offset });
      setData((current) => ({
        ...page,
        events: append ? [...current.events, ...page.events] : page.events,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load intelligence.");
    } finally {
      setLoading(false);
    }
  };

  const refreshLatest = async () => {
    setRefreshing(true);
    try {
      const latest = await fetchEventPage({ limit: 50, offset: 0 });
      setData((current) => {
        const known = new Set(latest.events.map((event) => event.id));
        return {
          ...current,
          total: latest.total,
          events: [...latest.events, ...current.events.filter((event) => !known.has(event.id))],
          nextOffset: current.nextOffset === null ? null : Math.max(current.nextOffset, current.events.length),
        };
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    void fetchNewsSources().then(setSources).catch(() => setSources([]));
    const timer = window.setInterval(() => { void refreshLatest(); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? data.events.filter((event) => [event.title, event.summary, event.country, event.category, event.sources[0]?.name]
          .some((value) => value?.toLowerCase().includes(normalized)))
      : data.events;
  }, [data.events, query]);

  return (
    <AtlasSectionShell
      title="News & Intelligence"
      subtitle={`${data.total.toLocaleString()} database records, ordered with the latest intelligence first.`}
      search={query}
      onSearch={setQuery}
    >
      <section className="atlas-news-page-grid">
        <div className="atlas-news-database atlas-card">
          <div className="atlas-section-title"><h2>All collected news</h2><button onClick={() => void refreshLatest()}>{refreshing ? "Syncing…" : "Refresh latest"}</button></div>
          <div className="atlas-news-coverage"><span>{data.total.toLocaleString()} database records</span><span>{visible.length.toLocaleString()} currently loaded</span><span>{sources.length} active feeds</span></div>
          {error && <p className="atlas-error">{error}</p>}
          <div className="atlas-news-page-list">
            {visible.map((event) => <NewsRow event={event} key={event.id} />)}
          </div>
          {loading && <p className="atlas-empty">Loading intelligence…</p>}
          {!loading && data.nextOffset !== null && (
            <button className="atlas-panel-button" onClick={() => void load(data.nextOffset!, true)}>Load older news</button>
          )}
        </div>
        <aside className="atlas-news-risk atlas-card">
          <div className="atlas-section-title"><h2>Real risk trend</h2><span>Loaded records</span></div>
          <RiskAnalytics events={data.events} />
          <div className="atlas-feed-directory">
            <div className="atlas-section-title"><h2>News feeds</h2><span>{sources.length}</span></div>
            {sources.slice(0, visibleSourceCount).map((source) => (
              <a href={source.siteUrl || source.feedUrl} target="_blank" rel="noreferrer" key={source.id}>
                <span><strong>{source.name}</strong><small>{source.credibilityTier} credibility{source.aiCredibilityScore != null ? ` · AI ${Math.round(source.aiCredibilityScore)}% from ${source.aiAssessmentCount} reports` : " · AI pending"}</small></span>
                <em>{Math.round(source.credibilityScore)}%</em>
              </a>
            ))}
            {visibleSourceCount < sources.length && (
              <button className="atlas-panel-button" onClick={() => setVisibleSourceCount((count) => count + 100)}>
                Show more feeds
              </button>
            )}
          </div>
        </aside>
      </section>
    </AtlasSectionShell>
  );
}

function NewsRow({ event }: { event: GeoEvent }) {
  return (
    <Link href={`/events/${event.id}`} className="atlas-news-page-row">
      {event.imageUrl
        ? <Image src={event.imageUrl} alt="" width={112} height={78} unoptimized />
        : <div className="atlas-news-page-placeholder">{event.region.slice(0, 2).toUpperCase()}</div>}
      <div>
        <span><b className={event.riskLevel}>{event.riskLevel}</b> {formatUserDateTime(event.timestamp)}</span>
        <h2>{event.title}</h2>
        <p>{event.summary}</p>
        <small>{event.sources[0]?.name} · {event.country} · Risk {event.riskScore}/100</small>
      </div>
    </Link>
  );
}
