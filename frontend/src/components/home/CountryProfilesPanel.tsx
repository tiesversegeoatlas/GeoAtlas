"use client";

import { Building2, Network, Shield, TrendingUp } from "lucide-react";
import { GeoEvent } from "@/types";
import { formatUserDateTime } from "@/lib/date-time";
import {
  CountryFlag,
  CountryShape,
  countryNameFromCode,
  normalizeCountryCode,
} from "./CountryIdentity";

export type CountryProfileData = {
  code: string;
  name: string;
  events: GeoEvent[];
};

export function buildCountryProfiles(events: GeoEvent[]): CountryProfileData[] {
  const grouped = new Map<string, GeoEvent[]>();
  for (const event of events) {
    const code = normalizeCountryCode(event.region);
    if (!code) continue;
    grouped.set(code, [...(grouped.get(code) || []), event]);
  }
  return Array.from(grouped, ([code, countryEvents]) => ({
    code,
    name: countryNameFromCode(code, countryEvents[0]?.country || code),
    events: countryEvents,
  })).sort((left, right) => {
    if (left.code === "IN") return -1;
    if (right.code === "IN") return 1;
    return right.events.length - left.events.length || left.name.localeCompare(right.name);
  });
}

export function CountryProfilesPanel({
  profiles,
  selectedCode,
  onSelect,
  onOpenEvent,
}: {
  profiles: CountryProfileData[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onOpenEvent: (event: GeoEvent) => void;
}) {
  const profile = profiles.find((entry) => entry.code === selectedCode) || profiles[0];
  if (!profile) {
    return <section className="atlas-country-directory atlas-card"><p className="atlas-empty">Country profiles will appear when events contain verified country codes.</p></section>;
  }
  const highRisk = profile.events.filter((event) => ["critical", "high"].includes(event.riskLevel)).length;
  const confidence = Math.round(profile.events.reduce((sum, event) => sum + event.confidenceScore, 0) / profile.events.length);
  const lead = profile.events[0];
  const categories = Array.from(new Set(profile.events.map((event) => event.category)));

  return (
    <section className="atlas-country-directory atlas-card" id="atlas-country-profiles">
      <aside>
        <div className="atlas-section-title"><h2>Country Profiles</h2><span>{profiles.length} monitored</span></div>
        <label><span>Find country</span><select value={profile.code} onChange={(event) => onSelect(event.target.value)}>
          {profiles.map((entry) => <option value={entry.code} key={entry.code}>{entry.name} ({entry.events.length})</option>)}
        </select></label>
        <div className="atlas-country-directory-list">
          {profiles.slice(0, 18).map((entry) => <button className={entry.code === profile.code ? "selected" : ""} onClick={() => onSelect(entry.code)} key={entry.code}>
            <CountryFlag code={entry.code} name={entry.name} />
            <span><strong>{entry.name}</strong><small>{entry.events.length} events</small></span>
          </button>)}
        </div>
      </aside>
      <article>
        <header>
          <CountryFlag code={profile.code} name={profile.name} className="large" />
          <div><span>{profile.code}</span><h2>{profile.name}</h2><p>Live geopolitical and country intelligence profile</p></div>
          <CountryShape code={profile.code} name={profile.name} className="hero" />
        </header>
        <div className="atlas-country-profile-metrics">
          <div><span>Active Events</span><strong>{profile.events.length}</strong></div>
          <div><span>High Risk</span><strong>{highRisk}</strong></div>
          <div><span>Confidence</span><strong>{confidence}%</strong></div>
          <div><span>Top Category</span><strong>{categories[0] || "General"}</strong></div>
        </div>
        <div className="atlas-country-profile-columns">
          <div>
            <h3>Current Intelligence</h3>
            {profile.events.slice(0, 5).map((event) => <button key={event.id} onClick={() => onOpenEvent(event)}>
              <i className={event.riskLevel} /><span><strong>{event.title}</strong><small>{event.category} · {event.riskLevel} risk</small></span>
            </button>)}
          </div>
          <div>
            <h3>Profile Summary</h3>
            <dl>
              <div><dt>Primary source</dt><dd>{lead.sources[0]?.name || "Unknown"}</dd></div>
              <div><dt>Current risk</dt><dd>{lead.riskLevel}</dd></div>
              <div><dt>Categories</dt><dd>{categories.slice(0, 3).join(", ")}</dd></div>
              <div><dt>Latest update</dt><dd>{formatUserDateTime(lead.timestamp)}</dd></div>
            </dl>
            <div className="atlas-country-profile-icons">
              <span><Building2 /> Politics</span><span><TrendingUp /> Economy</span><span><Shield /> Security</span><span><Network /> Relations</span>
            </div>
          </div>
        </div>
        {profile.code === "IN" && <p className="atlas-boundary-note">India&apos;s profile outline is derived from the official Bhuvan/NRSC state-boundary vector layer. Other country silhouettes use the Natural Earth public-domain dataset.</p>}
      </article>
    </section>
  );
}
