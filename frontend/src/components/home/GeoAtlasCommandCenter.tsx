"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  Command,
  Expand,
  Filter,
  Globe2,
  Layers3,
  LocateFixed,
  Map,
  Newspaper,
  RefreshCw,
  Search,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { useEventStore } from "@/stores/eventStore";
import { GeoEvent, RiskLevel } from "@/types";
import {
  formatRelativeTime,
  formatUserDateTime,
  parseTimestamp,
  userTimeZone,
} from "@/lib/date-time";
import { CountryProfilesPanel, buildCountryProfiles } from "./CountryProfilesPanel";

const HomeWorldMap = dynamic(() => import("@/components/home/HomeWorldMap"), {
  ssr: false,
  loading: () => <div className="atlas-map-loading" />,
});

type SectionId = "overview" | "map" | "news" | "country";

const primaryNav = [
  { label: "Overview", icon: Globe2, section: "overview" as const },
  { label: "Live Map", icon: Map, section: "map" as const },
  { label: "News & Intel", icon: Newspaper, section: "news" as const },
  { label: "Country Profiles", icon: Users, section: "country" as const },
];

function searchFields(event: GeoEvent): string {
  return [
    event.title,
    event.summary,
    event.description,
    event.country,
    event.region,
    event.category,
    event.breakingReason || "",
    ...event.sources.map((source) => source.name),
  ]
    .join(" ")
    .toLowerCase();
}

function sortByFreshness(events: GeoEvent[]): GeoEvent[] {
  return [...events].sort(
    (left, right) =>
      parseTimestamp(right.timestamp).getTime() - parseTimestamp(left.timestamp).getTime(),
  );
}

function riskColor(event: GeoEvent) {
  return event.riskLevel;
}

function EventThumbnail({ event, index }: { event: GeoEvent; index: number }) {
  const [failed, setFailed] = useState(false);

  if (event.imageUrl && !failed) {
    return (
      <Image
        src={event.imageUrl}
        alt=""
        width={72}
        height={72}
        unoptimized
        className="atlas-feed-image"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`atlas-feed-image atlas-placeholder atlas-placeholder-${index % 3}`}>
      <Globe2 />
    </div>
  );
}

export function GeoAtlasCommandCenter() {
  const router = useRouter();
  const { events, error, loadEvents } = useEventStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const initialLoadSeededRef = useRef(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locatedOnly, setLocatedOnly] = useState(false);
  const [layer, setLayer] = useState<"dark" | "light">("dark");
  const [mapCommand, setMapCommand] = useState<{
    action: "idle" | "reset" | "zoom-in" | "zoom-out";
    nonce: number;
  }>({ action: "idle", nonce: 0 });
  const [mapExpanded, setMapExpanded] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unseenIds, setUnseenIds] = useState<Set<string>>(new Set());
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>("IN");

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const currentIds = new Set(events.map((event) => event.id));

    if (!initialLoadSeededRef.current) {
      if (!events.length) {
        return;
      }
      knownIdsRef.current = currentIds;
      initialLoadSeededRef.current = true;
      return;
    }

    const newEvents = events.filter((event) => !knownIdsRef.current?.has(event.id));
    if (newEvents.length) {
      setUnseenIds((current) => {
        const next = new Set(current);
        newEvents.forEach((event) => next.add(event.id));
        return next;
      });

      toast.success(
        newEvents.length === 1 ? "1 new report added" : `${newEvents.length} new reports added`,
        {
          description:
            newEvents.length === 1
              ? newEvents[0].title
              : "Open notifications to review the latest additions.",
        },
      );
    }

    knownIdsRef.current = currentIds;
  }, [events]);

  const sortedEvents = useMemo(() => sortByFreshness(events), [events]);
  const categories = useMemo(
    () => Array.from(new Set(events.map((event) => event.category))).sort(),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return sortedEvents.filter((event) => {
      const matchesQuery = !normalized || searchFields(event).includes(normalized);
      const matchesRisk = riskFilter === "all" || event.riskLevel === riskFilter;
      const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
      const matchesLocation = !locatedOnly || event.country !== "Location unconfirmed";
      return matchesQuery && matchesRisk && matchesCategory && matchesLocation;
    });
  }, [categoryFilter, deferredQuery, locatedOnly, riskFilter, sortedEvents]);

  const breakingNews = useMemo(
    () =>
      visibleEvents
        .filter((event) => event.isBreaking)
        .sort((left, right) => {
          const leftRank = (left.isBreaking ? 100 : 0) + left.riskScore;
          const rightRank = (right.isBreaking ? 100 : 0) + right.riskScore;
          return rightRank - leftRank;
        })
        .slice(0, 5),
    [visibleEvents],
  );

  const results = useMemo(() => visibleEvents.slice(0, 10), [visibleEvents]);
  const countryProfiles = useMemo(() => buildCountryProfiles(events), [events]);
  const timezoneLabel = userTimeZone();
  const notificationItems = visibleEvents.slice(0, 6);
  const spotlightEvents = useMemo(() => visibleEvents.slice(0, 3), [visibleEvents]);

  const refreshAll = () => {
    void loadEvents(true);
  };

  const openEvent = (event: GeoEvent) => {
    setUnseenIds((current) => {
      if (!current.has(event.id)) return current;
      const next = new Set(current);
      next.delete(event.id);
      return next;
    });
    router.push(`/events/${event.id}`);
  };

  const runMapCommand = (action: "reset" | "zoom-in" | "zoom-out") => {
    setMapCommand((current) => ({ action, nonce: current.nonce + 1 }));
  };

  const navigate = (section: SectionId) => {
    if (section === "map") {
      router.push("/live-map");
      return;
    }
    if (section === "news") {
      router.push("/news");
      return;
    }
    setActiveSection(section);
    if (section === "country") {
      window.setTimeout(() => {
        document.getElementById("atlas-country-profiles")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      return;
    }
    window.setTimeout(() => {
      document.getElementById("atlas-overview")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  return (
    <main className="atlas-shell" id="atlas-overview">
      <aside className="atlas-sidebar">
        <button className="atlas-brand" onClick={() => navigate("overview")}>
          <div className="atlas-brand-orbit"><Globe2 /></div>
          <div><strong>Geo Atlas</strong><span>by Ties</span></div>
          <ChevronLeft className="atlas-collapse" />
        </button>
        <nav className="atlas-nav">
          {primaryNav.map(({ label, icon: Icon, section }) => (
            <button
              key={label}
              onClick={() => navigate(section)}
              className={activeSection === section ? "active" : ""}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <section className="atlas-sidebar-section atlas-sidebar-intro">
          <span className="atlas-sidebar-label">Workspace</span>
          <strong>Public Intelligence Overview</strong>
          <p>Live map, breaking developments, and routed news views in one paper-style workspace.</p>
        </section>
        <section className="atlas-sidebar-section atlas-sidebar-stats">
          <span className="atlas-sidebar-label">At a glance</span>
          <div>
            <strong>{events.length.toLocaleString()}</strong>
            <small>Total reports</small>
          </div>
          <div>
            <strong>{breakingNews.length}</strong>
            <small>Breaking now</small>
          </div>
          <div>
            <strong>{categories.length}</strong>
            <small>Tracked themes</small>
          </div>
        </section>
        <div className="atlas-sidebar-profile">
          <div className="atlas-avatar">GA</div>
          <div>
            <strong>GeoAtlas Ops</strong>
            <span>Commercial public API</span>
          </div>
        </div>
      </aside>

      <section className="atlas-main">
        <header className="atlas-topbar">
          <label className="atlas-search">
            <Search />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search countries, states, regions, sources, and topics..."
            />
            <kbd><Command />K</kbd>
          </label>
          <div className="atlas-top-actions">
            <button aria-label="Refresh" onClick={refreshAll}>
              <RefreshCw />
            </button>
            <button
              aria-label="Notifications"
              onClick={() => {
                setNotificationsOpen((value) => {
                  const next = !value;
                  if (next) setUnseenIds(new Set());
                  return next;
                });
              }}
            >
              <Bell />
              {unseenIds.size > 0 ? (
                <span className="atlas-action-count">{Math.min(unseenIds.size, 9)}</span>
              ) : null}
            </button>
          </div>
          {notificationsOpen && (
            <div className="atlas-popover atlas-notifications">
              <strong>Latest intelligence</strong>
              {notificationItems.map((event) => (
                <button key={event.id} onClick={() => openEvent(event)}>
                  <span className={riskColor(event)} />
                  <div className="atlas-notification-copy">
                    <b>{event.title}</b>
                    <small>{formatRelativeTime(event.timestamp)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </header>

        <section className="atlas-welcome-card atlas-card">
          <div className="atlas-welcome-copy">
            <span className="atlas-kicker">Global intelligence workspace</span>
            <h1>See the forces behind the headlines.</h1>
            <p>
              Search by country, state, source, or topic to narrow both mapped reports and the latest intelligence feed.
            </p>
          </div>
          <div className="atlas-welcome-prompts">
            {spotlightEvents.map((event) => (
              <button key={event.id} onClick={() => openEvent(event)} className="atlas-welcome-prompt">
                <span>{event.country}</span>
                <strong>{event.title}</strong>
                <i>
                  Open report
                  <ArrowRight />
                </i>
              </button>
            ))}
          </div>
        </section>

        {activeSection === "country" && (
          <CountryProfilesPanel
            profiles={countryProfiles}
            selectedCode={selectedCountryCode}
            onSelect={setSelectedCountryCode}
            onOpenEvent={openEvent}
          />
        )}

        <div className="atlas-dashboard-grid">
          <section id="atlas-map" className={`atlas-map-card atlas-card ${mapExpanded ? "atlas-map-expanded" : ""}`}>
            <div className="atlas-card-heading">
              <div>
                <h1>Global Intelligence Map</h1>
                <p>{timezoneLabel} | Last 24 hours | Search narrows both mapped and related reports</p>
              </div>
              <div className="atlas-map-filters">
                <select
                  aria-label="Risk filter"
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value as "all" | RiskLevel)}
                >
                  <option value="all">All Events</option>
                  <option value="critical">Critical</option>
                  <option value="high">High Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="low">Low Risk</option>
                </select>
                <select
                  aria-label="Category filter"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
                <button
                  className={locatedOnly ? "selected" : ""}
                  onClick={() => setLocatedOnly((value) => !value)}
                >
                  Located Only
                </button>
                <button aria-label="Expand" onClick={() => setMapExpanded((value) => !value)}>
                  <Expand />
                </button>
              </div>
            </div>
            <div className="atlas-map-stage">
              <HomeWorldMap
                events={visibleEvents}
                layer={layer}
                mapCommand={mapCommand}
                onSelect={openEvent}
              />
              <div className="atlas-map-tools">
                <button title="Change map layer" onClick={() => setLayer((value) => value === "dark" ? "light" : "dark")}><Layers3 /></button>
                <button title="Toggle located events" className={locatedOnly ? "selected" : ""} onClick={() => setLocatedOnly((value) => !value)}><Filter /></button>
                <button title="Reset map" onClick={() => runMapCommand("reset")}><LocateFixed /></button>
                <button title="Zoom in" onClick={() => runMapCommand("zoom-in")}><ZoomIn /></button>
                <button title="Zoom out" onClick={() => runMapCommand("zoom-out")}><ZoomOut /></button>
              </div>
            </div>
          </section>

          <aside className="atlas-right-column">
            <section className="atlas-hotspots atlas-card atlas-breaking-card">
              <div className="atlas-section-title">
                <h2>Breaking News</h2>
                <span>{breakingNews.length} live</span>
              </div>
              <div className="atlas-feed-list">
                {breakingNews.map((event) => (
                  <button
                    onClick={() => openEvent(event)}
                    key={event.id}
                    className="atlas-feed-row atlas-feed-row-wide atlas-breaking-row"
                  >
                    <EventThumbnail event={event} index={0} />
                    <div>
                      <span><b>BREAKING</b> {formatRelativeTime(event.timestamp)} | {formatUserDateTime(event.timestamp)}</span>
                      <strong>{event.title}</strong>
                      <p>{event.summary}</p>
                      <small>{event.country} | {event.category}</small>
                    </div>
                  </button>
                ))}
                {!breakingNews.length && (
                  <p className="atlas-empty">No breaking reports in the current view.</p>
                )}
              </div>
            </section>
          </aside>

          <section className="atlas-results-card atlas-card">
            <div className="atlas-section-title">
              <h2>{deferredQuery ? `Search Results: ${deferredQuery}` : "Latest Reports"}</h2>
              <span>{results.length} visible</span>
            </div>
            <div className="atlas-feed-list atlas-feed-list-tall">
              {results.map((event, index) => (
                <button onClick={() => openEvent(event)} key={event.id} className="atlas-feed-row atlas-feed-row-wide">
                  <EventThumbnail event={event} index={index} />
                  <div>
                    <span>{event.isBreaking && <b>BREAKING</b>} {formatRelativeTime(event.timestamp)} | {formatUserDateTime(event.timestamp)}</span>
                    <strong>{event.title}</strong>
                    <p>{event.summary}</p>
                    <small>{event.country} | {event.category}</small>
                  </div>
                </button>
              ))}
              {!results.length && <p className="atlas-empty">No reports match this keyword yet.</p>}
            </div>
          </section>
        </div>

        {error ? <p className="atlas-empty atlas-error-banner">Feed sync issue: {error}</p> : null}
      </section>
    </main>
  );
}
