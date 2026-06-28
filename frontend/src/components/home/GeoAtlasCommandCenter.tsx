"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Bookmark, Box, BriefcaseBusiness, Building2, Check, ChevronDown,
  ChevronLeft, CircleDot, Command, Compass, Expand, FileBarChart, FileText,
  Filter, Globe2, Home, Layers3, Map, Network, Newspaper, Pause, Play, Plus,
  Search, Settings2, Shield, SlidersHorizontal, TrendingUp, Users, X, ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { GeoEvent, OverviewAnalytics, RiskLevel } from "@/types";
import { fetchOverview } from "@/lib/geoatlas-api";
import { formatRelativeTime, formatUserMonthYear } from "@/lib/date-time";
import { CountryFlag, CountryShape, countryNameFromCode, normalizeCountryCode } from "./CountryIdentity";
import { buildCountryProfiles, CountryProfilesPanel } from "./CountryProfilesPanel";
import { RiskAnalytics, buildRiskAnalytics } from "@/components/intelligence/RiskAnalytics";

const HomeWorldMap = dynamic(() => import("@/components/home/HomeWorldMap"), {
  ssr: false,
  loading: () => <div className="atlas-map-loading" />,
});

type SectionId = "overview" | "map" | "news" | "country" | "risk" | "themes" | "explorer" | "reports" | "saved";

const primaryNav: { label: string; icon: typeof Home; section: SectionId }[] = [
  { label: "Overview", icon: Home, section: "overview" },
  { label: "Live Map", icon: Map, section: "map" },
  { label: "News & Intel", icon: Newspaper, section: "news" },
  { label: "Country Profiles", icon: Globe2, section: "country" },
  { label: "Risk Monitor", icon: Shield, section: "risk" },
  { label: "Themes", icon: Network, section: "themes" },
  { label: "Data Explorer", icon: SlidersHorizontal, section: "explorer" },
  { label: "Reports", icon: FileBarChart, section: "reports" },
  { label: "Saved", icon: Bookmark, section: "saved" },
];

const workspaceNav = [
  { label: "Indo-Pacific Desk", icon: Users, query: "Asia" },
  { label: "West Asia Desk", icon: FileText, query: "Middle East" },
  { label: "China Monitor", icon: Network, query: "China" },
  { label: "Energy Security", icon: BriefcaseBusiness, query: "energy" },
];

function safeTime(value: string) {
  return formatRelativeTime(value);
}

function riskColor(event: GeoEvent) {
  return event.riskLevel;
}

function EventThumbnail({ event, index }: { event: GeoEvent; index: number }) {
  const [failed, setFailed] = useState(false);
  if (event.imageUrl && !failed) {
    return <Image src={event.imageUrl} alt="" width={62} height={62} unoptimized className="atlas-feed-image" onError={() => setFailed(true)} />;
  }
  return <div className={`atlas-feed-image atlas-placeholder atlas-placeholder-${index % 3}`}>
    {index % 3 === 0 ? <Globe2 /> : index % 3 === 1 ? <Building2 /> : <Compass />}
  </div>;
}

function EventDialog({ event, saved, onClose, onSave }: {
  event: GeoEvent;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return <div className="atlas-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <article className="atlas-event-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <span className={`atlas-dialog-risk ${event.riskLevel}`}>{event.riskLevel} risk</span>
        <div><button onClick={onSave} aria-label={saved ? "Remove saved event" : "Save event"}><Bookmark fill={saved ? "currentColor" : "none"} /></button><button onClick={onClose} aria-label="Close"><X /></button></div>
      </header>
      <h2>{event.title}</h2>
      <p className="atlas-dialog-meta">{event.country} · {event.category} · {safeTime(event.timestamp)}</p>
      <p>{event.description}</p>
      <dl>
        <div><dt>Verification</dt><dd>{event.verificationStatus}</dd></div>
        <div><dt>Confidence</dt><dd>{event.confidenceScore}%</dd></div>
        <div><dt>Source</dt><dd>{event.sources[0]?.name || "Unknown"}</dd></div>
        <div><dt>Region</dt><dd>{event.region}</dd></div>
      </dl>
      {event.canonicalUrl && <a href={event.canonicalUrl} target="_blank" rel="noreferrer">Open original report</a>}
    </article>
  </div>;
}

export function GeoAtlasCommandCenter() {
  const router = useRouter();
  const { events, loading, error, loadEvents } = useEventStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locatedOnly, setLocatedOnly] = useState(false);
  const [layer, setLayer] = useState<"dark" | "light">("dark");
  const [zoomCommand, setZoomCommand] = useState(0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [timelinePlaying, setTimelinePlaying] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<GeoEvent | null>(null);
  const [selectedCountryTab, setSelectedCountryTab] = useState("Profile");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>("IN");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);

  useEffect(() => { void loadEvents(); }, [loadEvents]);
  useEffect(() => {
    const refreshOverview = () => void fetchOverview().then(setOverview).catch(() => undefined);
    refreshOverview();
    const timer = window.setInterval(refreshOverview, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedEvent(null);
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const categories = useMemo(() => Array.from(new Set(events.map((event) => event.category))).sort(), [events]);
  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesQuery = !normalized || [event.title, event.summary, event.country, event.region, event.category]
        .some((value) => value.toLowerCase().includes(normalized));
      const matchesRisk = riskFilter === "all" || event.riskLevel === riskFilter;
      const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
      const matchesLocation = !locatedOnly || event.country !== "Location unconfirmed";
      const matchesSaved = activeSection !== "saved" || savedIds.has(event.id);
      return matchesQuery && matchesRisk && matchesCategory && matchesLocation && matchesSaved;
    });
  }, [activeSection, categoryFilter, events, locatedOnly, query, riskFilter, savedIds]);

  const locatedEvents = visibleEvents.filter((event) => event.country !== "Location unconfirmed");
  const countryProfiles = useMemo(() => buildCountryProfiles(events), [events]);
  const selectedCountryProfile = countryProfiles.find((profile) => profile.code === selectedCountryCode) || countryProfiles[0];
  const hotspots = locatedEvents.slice(0, 5);
  const feed = visibleEvents.slice(0, activeSection === "news" || activeSection === "saved" ? 10 : 3);
  const reports = visibleEvents.slice(3, activeSection === "reports" ? 12 : 7);
  const countryEvent = selectedCountryProfile?.events[0] || locatedEvents[0] || visibleEvents[0];
  const countryCode = selectedCountryProfile?.code || normalizeCountryCode(countryEvent?.region);
  const countryName = selectedCountryProfile?.name || countryNameFromCode(countryCode, countryEvent?.country);
  const riskAnalytics = useMemo(() => buildRiskAnalytics(visibleEvents), [visibleEvents]);
  const riskIndex = overview?.overallRisk ?? riskAnalytics.overall;
  const overviewTotals = {
    total: overview?.totalNews ?? visibleEvents.length,
    highRisk: overview?.highRiskEvents ?? visibleEvents.filter((event) => ["critical", "high"].includes(event.riskLevel)).length,
    countries: overview?.countriesAffected ?? new Set(locatedEvents.map((event) => event.country)).size,
    policy: overview?.policyEvents ?? visibleEvents.filter((event) => event.category === "political").length,
  };
  const refreshAll = () => {
    void loadEvents(true);
    void fetchOverview().then(setOverview).catch(() => undefined);
  };

  const navigate = (section: SectionId) => {
    if (section === "map") {
      router.push("/live-map");
      return;
    }
    if (section === "news" || section === "explorer") {
      router.push("/news");
      return;
    }
    setActiveSection(section);
    if (section === "saved") setQuery("");
    const target = section === "overview"
      ? "atlas-overview"
      : section === "country"
        ? "atlas-country-profiles"
      : section === "saved"
        ? "atlas-news"
        : `atlas-${section}`;
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const toggleSave = (id: string) => setSavedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openEvent = (event: GeoEvent) => router.push(`/events/${event.id}`);

  return <main className="atlas-shell" id="atlas-overview">
    <aside className="atlas-sidebar">
      <button className="atlas-brand" onClick={() => navigate("overview")}>
        <div className="atlas-brand-orbit"><Globe2 /></div><div><strong>Geo Atlas</strong><span>by Ties</span></div><ChevronLeft className="atlas-collapse" />
      </button>
      <nav className="atlas-nav">
        {primaryNav.map(({ label, icon: Icon, section }) => <button key={label} onClick={() => navigate(section)} className={activeSection === section ? "active" : ""}><Icon /><span>{label}</span></button>)}
      </nav>
      <div className="atlas-workspaces">
        <p>MY WORKSPACES</p>
        {workspaceNav.map(({ label, icon: Icon, query: workspaceQuery }) => <button key={label} onClick={() => { setQuery(workspaceQuery); navigate("news"); }}><Icon /><span>{label}</span></button>)}
        {creatingWorkspace ? <form onSubmit={(event) => { event.preventDefault(); if (workspaceName.trim()) { setQuery(workspaceName.trim()); navigate("news"); } setCreatingWorkspace(false); }}>
          <input autoFocus value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Workspace focus" />
        </form> : <button onClick={() => setCreatingWorkspace(true)}><Plus /><span>New Workspace</span></button>}
      </div>
      <button className="atlas-profile" onClick={() => setProfileOpen((value) => !value)}>
        <div className="atlas-avatar">AR</div><div><strong>Arjun Rao</strong><span>Analyst</span></div><ChevronDown /><Settings2 />
      </button>
      {profileOpen && <div className="atlas-popover atlas-profile-menu"><button onClick={() => setProfileOpen(false)}>Profile settings</button><button onClick={() => { setRiskFilter("all"); setCategoryFilter("all"); setQuery(""); }}>Reset workspace</button></div>}
    </aside>

    <section className="atlas-main">
      <header className="atlas-topbar">
        <label className="atlas-search"><Search /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search countries, regions, topics, reports..." /><kbd><Command />K</kbd></label>
        <div className="atlas-top-actions">
          <button aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}><Bell /><span className="atlas-action-count">{Math.min(events.length, 9)}</span></button>
          <button aria-label="Saved" onClick={() => navigate("saved")}><Bookmark fill={savedIds.size ? "currentColor" : "none"} /><span className="atlas-action-count">{savedIds.size}</span></button>
          <button className="atlas-avatar small" onClick={() => setProfileOpen((value) => !value)}>AR</button><ChevronDown />
        </div>
        {notificationsOpen && <div className="atlas-popover atlas-notifications"><strong>Latest intelligence</strong>{events.slice(0, 4).map((event) => <button key={event.id} onClick={() => openEvent(event)}><span className={riskColor(event)} />{event.title}</button>)}</div>}
      </header>

      {activeSection === "country" && <CountryProfilesPanel profiles={countryProfiles} selectedCode={selectedCountryCode} onSelect={setSelectedCountryCode} onOpenEvent={openEvent} />}
      <div className="atlas-dashboard-grid">
        <section id="atlas-map" className={`atlas-map-card atlas-card ${mapExpanded ? "atlas-map-expanded" : ""}`}>
          <div className="atlas-card-heading"><div><h1>Global Intelligence Map <span className="atlas-live-dot" /> <em>{error ? "Offline" : loading ? "Syncing" : timelinePlaying ? "Live" : "Paused"}</em></h1><p>Real-time geopolitical developments and risk hotspots</p></div>
            <div className="atlas-map-filters">
              <select aria-label="Risk filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as "all" | RiskLevel)}><option value="all">All Events</option><option value="critical">Critical</option><option value="high">High Risk</option><option value="medium">Medium Risk</option><option value="low">Low Risk</option></select>
              <select aria-label="Category filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All Categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
              <button className={locatedOnly ? "selected" : ""} onClick={() => setLocatedOnly((value) => !value)}>Located Only</button>
              <button aria-label="Expand" onClick={() => setMapExpanded((value) => !value)}><Expand /></button>
            </div>
          </div>
          <div className="atlas-map-stage"><HomeWorldMap events={visibleEvents} layer={layer} zoomCommand={zoomCommand} onSelect={openEvent} />
            <div className="atlas-map-tools">
              <button title="Change map layer" onClick={() => setLayer((value) => value === "dark" ? "light" : "dark")}><Layers3 /></button>
              <button title="Toggle located events" className={locatedOnly ? "selected" : ""} onClick={() => setLocatedOnly((value) => !value)}><Filter /></button>
              <button title="Reset map" onClick={() => setZoomCommand(0)}><CircleDot /></button>
              <button title="Zoom in" onClick={() => setZoomCommand((value) => value >= 0 ? value + 1 : 1)}><ZoomIn /></button>
              <button title="Zoom out" onClick={() => setZoomCommand((value) => value <= 0 ? value - 1 : -1)}><ZoomOut /></button>
            </div>
            <div className="atlas-timeline"><button onClick={() => setTimelinePlaying((value) => !value)}>{timelinePlaying ? <Pause /> : <Play />}</button><div><span><i /> {timelinePlaying ? "LIVE" : "PAUSED"}</span><div className="atlas-timeline-rule"><b /></div><div className="atlas-timeline-labels"><small>00:00</small><small>06:00</small><small>12:00</small><small>18:00</small><small>24:00</small></div></div><button onClick={() => setMapExpanded((value) => !value)}><Expand /> {mapExpanded ? "Exit Fullscreen" : "View Fullscreen"}</button></div>
          </div>
        </section>

        <aside className="atlas-right-column" id="atlas-risk">
          <section className="atlas-overview atlas-card"><div className="atlas-section-title"><h2>Global Overview</h2><button onClick={refreshAll}>Refresh</button></div><div className="atlas-stat-grid">
            <div><span>News Tracked</span><strong>{overviewTotals.total.toLocaleString()}</strong><small className="up">↑ Entire database</small></div>
            <div><span>High Risk Events</span><strong>{overviewTotals.highRisk.toLocaleString()}</strong><small className="danger">↑ All intelligence</small></div>
            <div><span>Countries Affected</span><strong>{overviewTotals.countries.toLocaleString()}</strong><small className="gold">↑ All resolved data</small></div>
            <div><span>Policy Events</span><strong>{overviewTotals.policy.toLocaleString()}</strong><small className="up">↑ Database-wide</small></div>
          </div></section>
          <section className="atlas-hotspots atlas-card"><div className="atlas-section-title"><h2>Hotspots</h2><button onClick={() => navigate("map")}>View all</button></div><div>{hotspots.map((event) => <button onClick={() => openEvent(event)} key={event.id} className="atlas-hotspot-row"><i className={riskColor(event)}><span /></i><div><strong>{event.title}</strong><span>{event.country}</span></div><em className={riskColor(event)}>● {event.riskLevel}</em></button>)}{!hotspots.length && <p className="atlas-empty">Waiting for resolved locations.</p>}</div></section>
        </aside>

        <section id="atlas-news" className="atlas-feed-card atlas-card"><div className="atlas-section-title"><h2>{activeSection === "saved" ? "Saved Intelligence" : "Intelligence Feed"}</h2><button onClick={() => navigate("news")}>View all</button></div><div className="atlas-feed-list">{feed.map((event, index) => <button onClick={() => openEvent(event)} key={event.id} className="atlas-feed-row"><EventThumbnail event={event} index={index} /><div><span>{event.isBreaking && <b>BREAKING</b>} {safeTime(event.timestamp)}</span><strong>{event.title}</strong><small>{event.country} · {event.category}</small></div><span className="atlas-save-inline" onClick={(click) => { click.stopPropagation(); toggleSave(event.id); }}>{savedIds.has(event.id) ? <Check /> : <Bookmark />}</span></button>)}</div><button className="atlas-panel-button" onClick={() => navigate("news")}>Show all News & Intel</button></section>

        <section id="atlas-country" className="atlas-country-card atlas-card"><div className="atlas-section-title"><h2>Country Profile</h2><button onClick={() => navigate("country")}>Focus</button></div>{countryEvent ? <><div className="atlas-country-name"><CountryFlag code={countryCode} name={countryName} /><div><strong>{countryName}</strong><span>Current monitored location</span></div></div><div className="atlas-country-body"><dl><div><dt>Category</dt><dd>{countryEvent.category}</dd></div><div><dt>Risk Level</dt><dd>{countryEvent.riskLevel}</dd></div><div><dt>Confidence</dt><dd>{countryEvent.confidenceScore}%</dd></div><div><dt>Source</dt><dd>{countryEvent.sources[0]?.name}</dd></div><div><dt>View</dt><dd>{selectedCountryTab}</dd></div></dl><CountryShape code={countryCode} name={countryName} /></div><div className="atlas-country-tabs">{[Box, Building2, TrendingUp, Shield, Network].map((Icon, index) => { const label = ["Profile", "Politics", "Economy", "Security", "Relations"][index]; return <button className={selectedCountryTab === label ? "selected" : ""} onClick={() => setSelectedCountryTab(label)} key={label}><Icon /><span>{label}</span></button>; })}</div></> : <p className="atlas-empty">No country profile available.</p>}</section>

        <section id="atlas-themes" className="atlas-risk-card atlas-card"><div className="atlas-section-title"><h2>Geopolitical Risk Index</h2><button onClick={() => navigate("risk")}>Focus</button></div><div className="atlas-risk-head"><strong>{riskIndex}<small>/100</small></strong><span><b>● {riskIndex >= 70 ? "High" : riskIndex >= 45 ? "Medium" : "Low"} Risk</b><small>Database-wide AI and category risk scores</small></span></div><RiskAnalytics events={visibleEvents} analytics={overview || undefined} compact /></section>

        <section id="atlas-reports" className="atlas-reports-card atlas-card"><div className="atlas-section-title"><h2>Strategic Reports</h2><button onClick={() => navigate("reports")}>View all</button></div><div className="atlas-report-list">{reports.map((event, index) => <button onClick={() => openEvent(event)} key={event.id}><EventThumbnail event={event} index={index + 1} /><div><strong>{event.title}</strong><span>{formatUserMonthYear(event.timestamp)}</span></div></button>)}</div><button className="atlas-panel-button" onClick={() => navigate("reports")}>Explore Reports</button></section>
      </div>
    </section>
    {selectedEvent && <EventDialog event={selectedEvent} saved={savedIds.has(selectedEvent.id)} onClose={() => setSelectedEvent(null)} onSave={() => toggleSave(selectedEvent.id)} />}
  </main>;
}
