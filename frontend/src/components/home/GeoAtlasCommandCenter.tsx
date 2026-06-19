"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bookmark,
  Box,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  Command,
  Compass,
  Expand,
  FileBarChart,
  FileText,
  Filter,
  Globe2,
  Home,
  Layers3,
  Map,
  Network,
  Newspaper,
  Play,
  Plus,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { GeoEvent } from "@/types";

const HomeWorldMap = dynamic(() => import("@/components/home/HomeWorldMap"), {
  ssr: false,
  loading: () => <div className="atlas-map-loading" />,
});

const primaryNav = [
  { label: "Overview", icon: Home, href: "/" },
  { label: "Live Map", icon: Map, href: "/map" },
  { label: "News & Intel", icon: Newspaper, href: "/feed" },
  { label: "Country Profiles", icon: Globe2, href: "/dashboard" },
  { label: "Risk Monitor", icon: Shield, href: "/dashboard" },
  { label: "Themes", icon: Network, href: "/dashboard" },
  { label: "Data Explorer", icon: SlidersHorizontal, href: "/dashboard" },
  { label: "Reports", icon: FileBarChart, href: "/dashboard" },
  { label: "Saved", icon: Bookmark, href: "/feed" },
];

const workspaceNav = [
  { label: "Indo-Pacific Desk", icon: Users },
  { label: "West Asia Desk", icon: FileText },
  { label: "China Monitor", icon: Network },
  { label: "Energy Security", icon: BriefcaseBusiness },
];

function safeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

function riskColor(event: GeoEvent) {
  if (event.riskLevel === "critical") return "critical";
  if (event.riskLevel === "high") return "high";
  if (event.riskLevel === "medium") return "medium";
  return "low";
}

function Sparkline() {
  return (
    <svg className="atlas-sparkline" viewBox="0 0 320 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="atlasLineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ec4554" stopOpacity=".25" />
          <stop offset="100%" stopColor="#ec4554" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 78 L25 56 L50 66 L76 42 L102 58 L128 42 L155 47 L180 26 L205 39 L231 18 L257 31 L283 14 L320 20 L320 100 L0 100Z" fill="url(#atlasLineFill)" />
      <path d="M0 78 L25 56 L50 66 L76 42 L102 58 L128 42 L155 47 L180 26 L205 39 L231 18 L257 31 L283 14 L320 20" fill="none" stroke="#ef4857" strokeWidth="3" />
    </svg>
  );
}

function EventThumbnail({ event, index }: { event: GeoEvent; index: number }) {
  const [failed, setFailed] = useState(false);
  if (event.imageUrl && !failed) {
    return (
      <Image
        src={event.imageUrl}
        alt=""
        width={62}
        height={62}
        unoptimized
        className="atlas-feed-image"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`atlas-feed-image atlas-placeholder atlas-placeholder-${index % 3}`}>
      {index % 3 === 0 ? <Globe2 /> : index % 3 === 1 ? <Building2 /> : <Compass />}
    </div>
  );
}

export function GeoAtlasCommandCenter() {
  const { events, loading, error, loadEvents } = useEventStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return events;
    return events.filter((event) =>
      [event.title, event.summary, event.country, event.category]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [events, query]);

  const locatedEvents = useMemo(
    () => visibleEvents.filter((event) => event.country !== "Location unconfirmed"),
    [visibleEvents],
  );
  const highRisk = visibleEvents.filter((event) => ["critical", "high"].includes(event.riskLevel)).length;
  const countries = new Set(locatedEvents.map((event) => event.country));
  const policyChanges = visibleEvents.filter((event) => event.category === "political").length;
  const hotspots = locatedEvents.slice(0, 5);
  const feed = visibleEvents.slice(0, 3);
  const reports = visibleEvents.slice(3, 7);
  const countryEvent = locatedEvents[0] || visibleEvents[0];
  const riskIndex = visibleEvents.length
    ? Math.round(visibleEvents.reduce((sum, event) => {
      return sum + ({ critical: 95, high: 78, medium: 58, low: 32 }[event.riskLevel]);
    }, 0) / visibleEvents.length)
    : 0;

  return (
    <main className="atlas-shell">
      <aside className="atlas-sidebar">
        <div className="atlas-brand">
          <div className="atlas-brand-orbit"><Globe2 /></div>
          <div>
            <strong>Geo Atlas</strong>
            <span>by Ties</span>
          </div>
          <ChevronLeft className="atlas-collapse" />
        </div>

        <nav className="atlas-nav">
          {primaryNav.map(({ label, icon: Icon, href }, index) => (
            <Link key={label} href={href} className={index === 0 ? "active" : ""}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="atlas-workspaces">
          <p>MY WORKSPACES</p>
          {workspaceNav.map(({ label, icon: Icon }) => (
            <button key={label}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <button><Plus /><span>New Workspace</span></button>
        </div>

        <div className="atlas-profile">
          <div className="atlas-avatar">AR</div>
          <div><strong>Arjun Rao</strong><span>Analyst</span></div>
          <ChevronDown />
          <Settings2 />
        </div>
      </aside>

      <section className="atlas-main">
        <header className="atlas-topbar">
          <label className="atlas-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search countries, regions, topics, reports..."
            />
            <kbd><Command />K</kbd>
          </label>
          <div className="atlas-top-actions">
            <button aria-label="Notifications"><Bell /></button>
            <button aria-label="Saved"><Bookmark /></button>
            <button className="atlas-avatar small">AR</button>
            <ChevronDown />
          </div>
        </header>

        <div className="atlas-dashboard-grid">
          <section className="atlas-map-card atlas-card">
            <div className="atlas-card-heading">
              <div>
                <h1>Global Intelligence Map <span className="atlas-live-dot" /> <em>{error ? "Offline" : loading ? "Syncing" : "Live"}</em></h1>
                <p>Real-time geopolitical developments and risk hotspots</p>
              </div>
              <div className="atlas-map-filters">
                <button>All Events <ChevronDown /></button>
                <button>Risk Level <ChevronDown /></button>
                <button>Categories</button>
                <button aria-label="Expand"><Expand /></button>
              </div>
            </div>
            <div className="atlas-map-stage">
              <HomeWorldMap events={visibleEvents} />
              <div className="atlas-map-tools">
                <button><Layers3 /></button>
                <button><Filter /></button>
                <button><CircleDot /></button>
                <button><ZoomIn /></button>
                <button><ZoomOut /></button>
              </div>
              <div className="atlas-timeline">
                <button><Play /></button>
                <div>
                  <span><i /> LIVE</span>
                  <div className="atlas-timeline-rule"><b /></div>
                  <div className="atlas-timeline-labels"><small>00:00</small><small>06:00</small><small>12:00</small><small>18:00</small><small>24:00</small></div>
                </div>
                <button><Expand /> View Fullscreen</button>
              </div>
            </div>
          </section>

          <aside className="atlas-right-column">
            <section className="atlas-overview atlas-card">
              <div className="atlas-section-title"><h2>Global Overview</h2><span>Last 24 Hours</span></div>
              <div className="atlas-stat-grid">
                <div><span>Events Tracked</span><strong>{visibleEvents.length.toLocaleString()}</strong><small className="up">↑ Live collection</small></div>
                <div><span>High Risk Events</span><strong>{highRisk}</strong><small className="danger">↑ Monitored</small></div>
                <div><span>Countries Affected</span><strong>{countries.size}</strong><small className="gold">↑ Resolved</small></div>
                <div><span>Policy Changes</span><strong>{policyChanges}</strong><small className="up">↑ Detected</small></div>
              </div>
            </section>

            <section className="atlas-hotspots atlas-card">
              <div className="atlas-section-title"><h2>Hotspots</h2><Link href="/map">View all</Link></div>
              <div>
                {hotspots.map((event) => (
                  <Link href={`/events/${event.id}`} key={event.id} className="atlas-hotspot-row">
                    <i className={riskColor(event)}><span /></i>
                    <div><strong>{event.title}</strong><span>{event.country}</span></div>
                    <em className={riskColor(event)}>● {event.riskLevel}</em>
                  </Link>
                ))}
                {!hotspots.length && <p className="atlas-empty">Waiting for resolved locations.</p>}
              </div>
            </section>
          </aside>

          <section className="atlas-feed-card atlas-card">
            <div className="atlas-section-title"><h2>Intelligence Feed</h2><Link href="/feed">View all</Link></div>
            <div className="atlas-feed-list">
              {feed.map((event, index) => (
                <Link href={`/events/${event.id}`} key={event.id} className="atlas-feed-row">
                  <EventThumbnail event={event} index={index} />
                  <div>
                    <span>{index === 0 && <b>BREAKING</b>} {safeTime(event.timestamp)}</span>
                    <strong>{event.title}</strong>
                    <small>{event.country} ・ {event.category}</small>
                  </div>
                </Link>
              ))}
            </div>
            <Link className="atlas-panel-button" href="/feed">Go to News & Intel</Link>
          </section>

          <section className="atlas-country-card atlas-card">
            <div className="atlas-section-title"><h2>Country Profile</h2><Link href="/map">View all</Link></div>
            {countryEvent ? (
              <>
                <div className="atlas-country-name">
                  <span className="atlas-flag">{countryEvent.region?.slice(0, 2) || "🌐"}</span>
                  <div><strong>{countryEvent.country}</strong><span>Current monitored location</span></div>
                </div>
                <div className="atlas-country-body">
                  <dl>
                    <div><dt>Category</dt><dd>{countryEvent.category}</dd></div>
                    <div><dt>Risk Level</dt><dd>{countryEvent.riskLevel}</dd></div>
                    <div><dt>Confidence</dt><dd>{countryEvent.confidenceScore}%</dd></div>
                    <div><dt>Source</dt><dd>{countryEvent.sources[0]?.name}</dd></div>
                  </dl>
                  <Globe2 />
                </div>
                <div className="atlas-country-tabs">
                  {[Box, Building2, TrendingUp, Shield, Network].map((Icon, index) => (
                    <button key={index}><Icon /><span>{["Profile", "Politics", "Economy", "Security", "Relations"][index]}</span></button>
                  ))}
                </div>
              </>
            ) : <p className="atlas-empty">No country profile available.</p>}
          </section>

          <section className="atlas-risk-card atlas-card">
            <div className="atlas-section-title"><h2>Geopolitical Risk Index</h2><Link href="/dashboard">View all</Link></div>
            <div className="atlas-risk-head">
              <strong>{riskIndex}<small>/100</small></strong>
              <span><b>● High Risk</b><small>↑ Live collected output</small></span>
            </div>
            <div className="atlas-chart-wrap">
              <Sparkline />
              <div className="atlas-chart-months"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span></div>
            </div>
            <h3>Risk Breakdown</h3>
            <div className="atlas-risk-bars">
              {[
                ["Security", Math.min(100, highRisk * 8 + 35), "red"],
                ["Political", Math.min(100, policyChanges + 42), "pink"],
                ["Economic", Math.min(100, countries.size * 5 + 35), "orange"],
                ["Social", Math.min(100, visibleEvents.length / 2 + 25), "yellow"],
                ["Environmental", Math.min(100, visibleEvents.filter((event) => event.category === "disaster").length * 12 + 25), "green"],
              ].map(([label, value, color]) => (
                <div key={label as string}><span>{label}</span><i><b className={color as string} style={{ width: `${value}%` }} /></i><em>{Math.round(value as number)}/100</em></div>
              ))}
            </div>
          </section>

          <section className="atlas-reports-card atlas-card">
            <div className="atlas-section-title"><h2>Strategic Reports</h2><Link href="/feed">View all</Link></div>
            <div className="atlas-report-list">
              {reports.map((event, index) => (
                <Link href={`/events/${event.id}`} key={event.id}>
                  <EventThumbnail event={event} index={index + 1} />
                  <div><strong>{event.title}</strong><span>{new Date(event.timestamp).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span></div>
                </Link>
              ))}
            </div>
            <Link className="atlas-panel-button" href="/feed">Go to Reports</Link>
          </section>
        </div>
      </section>
    </main>
  );
}
