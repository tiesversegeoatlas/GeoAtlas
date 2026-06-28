"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AtlasSectionShell } from "@/components/intelligence/AtlasSectionShell";
import { CountryFlag, CountryShape, countryNameFromCode, normalizeCountryCode } from "@/components/home/CountryIdentity";
import { fetchEvent } from "@/lib/geoatlas-api";
import { formatUserDateTime, userTimeZone } from "@/lib/date-time";
import { GeoEvent } from "@/types";

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<GeoEvent | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchEvent(id).then(setEvent).catch((reason) => setError(reason instanceof Error ? reason.message : "Event not found."));
  }, [id]);
  if (!event) {
    return <AtlasSectionShell title="Event Intelligence" subtitle="Loading the complete database record."><section className="atlas-card atlas-event-page"><p className="atlas-empty">{error || "Loading event…"}</p></section></AtlasSectionShell>;
  }
  const code = normalizeCountryCode(event.region);
  const country = countryNameFromCode(code, event.country);
  return (
    <AtlasSectionShell title="Event Intelligence" subtitle="Complete collected record, source context and risk assessment.">
      <article className="atlas-card atlas-event-page">
        <header>
          <div>
            <span className={`atlas-event-page-risk ${event.riskLevel}`}>{event.riskLevel} risk · {event.riskScore}/100</span>
            <h1>{event.title}</h1>
            <p>{formatUserDateTime(event.timestamp)} · {event.sources[0]?.name} · {userTimeZone()}</p>
          </div>
          <div className="atlas-event-country">
            <CountryFlag code={code} name={country} className="large" />
            <CountryShape code={code} name={country} />
          </div>
        </header>
        {event.imageUrl && <Image src={event.imageUrl} alt="" width={1200} height={600} unoptimized className="atlas-event-hero" />}
        <div className="atlas-event-page-content">
          <section>
            <h2>Summary</h2>
            <p>{event.summary}</p>
            <h2>Report</h2>
            <p>{event.description}</p>
          </section>
          <aside>
            <dl>
              <div><dt>Country</dt><dd>{country}</dd></div>
              <div><dt>Category</dt><dd>{event.category}</dd></div>
              <div><dt>Confidence</dt><dd>{event.confidenceScore}%</dd></div>
              <div><dt>Urgency</dt><dd>{event.urgencyScore}/100</dd></div>
              <div><dt>Importance</dt><dd>{event.importanceScore}/100</dd></div>
              <div><dt>Verification</dt><dd>{event.verificationStatus}</dd></div>
            </dl>
            {event.canonicalUrl && <a href={event.canonicalUrl} target="_blank" rel="noreferrer">Read original source ↗</a>}
            <Link href="/news">← Back to all news</Link>
          </aside>
        </div>
      </article>
    </AtlasSectionShell>
  );
}
