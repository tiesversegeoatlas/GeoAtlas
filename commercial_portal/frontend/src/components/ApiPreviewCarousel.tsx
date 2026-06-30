"use client";

import { useEffect, useState } from "react";

const examples = [
  {
    label: "Latest intelligence",
    description: "Enriched reports from the last 24 hours",
    code: `GET /api/v1/public/items?since_hours=24&limit=2
X-API-Key: your_live_key

{
  "items": [{
    "id": "report_01",
    "title": "Power grid review ordered after heatwave surge",
    "summary": "Authorities review reserve generation after peak demand.",
    "locations": [{ "name": "India", "country_code": "IN" }],
    "risk_score": 63,
    "risk_level": "medium",
    "is_breaking": true
  }],
  "total": 286,
  "next_cursor": "2"
}`,
  },
  {
    label: "Event monitoring",
    description: "Filter deduplicated events by country and risk",
    code: `GET /api/v1/public/events?country_code=IN&risk_hint=high
Authorization: Bearer your_live_key

[{
  "id": "event_903",
  "normalized_item_id": "report_01",
  "title": "Regional security posture raised",
  "summary": "Authorities increased monitoring at key transport hubs.",
  "category_hints": ["security", "transport"],
  "location_hints": [{ "name": "India", "country_code": "IN" }],
  "risk_hint": "high",
  "publication_status": "published"
}]`,
  },
  {
    label: "Source credibility",
    description: "Inspect active publishers and credibility metadata",
    code: `GET /api/v1/public/output-sources
X-API-Key: your_live_key

[{
  "id": "source_18",
  "name": "The Hindu",
  "feed_url": "https://publisher.example/feed",
  "site_url": "https://publisher.example",
  "credibility_score": 84.0,
  "credibility_tier": "high",
  "last_success_at": "2026-06-30T09:42:00Z"
}]`,
  },
  {
    label: "Risk overview",
    description: "Power dashboards with aggregate intelligence signals",
    code: `GET /api/v1/public/overview
X-API-Key: your_live_key

{
  "total_news": 1284,
  "high_risk_events": 47,
  "countries_affected": 62,
  "policy_events": 91,
  "overall_risk": 58,
  "timeline": [
    { "date": "2026-06-30", "label": "Jun 30", "risk": 61, "events": 84 }
  ],
  "generated_at": "2026-06-30T10:00:00Z"
}`,
  },
  {
    label: "Complete report",
    description: "Retrieve full content, locations, scoring and ranking",
    code: `GET /api/v1/public/items/report_01
X-API-Key: your_live_key

{
  "id": "report_01",
  "title": "Power grid review ordered after heatwave surge",
  "summary": "Authorities review reserve generation after peak demand.",
  "body": "The complete enriched report body is returned here...",
  "locations": [{
    "name": "New Delhi",
    "country_code": "IN",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "confidence": 0.96
  }],
  "risk_score": 63,
  "urgency_score": 72,
  "credibility_score": 84.0,
  "rank_score": 76.4
}`,
  },
];

export function ApiPreviewCarousel() {
  const [active, setActive] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const paused = interacting;

  const positionFor = (index: number): "previous" | "active" | "next" | "hidden" => {
    let distance = (index - active + examples.length) % examples.length;
    if (distance > examples.length / 2) distance -= examples.length;
    if (distance === -1) return "previous";
    if (distance === 0) return "active";
    if (distance === 1) return "next";
    return "hidden";
  };

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % examples.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [active, paused]);

  return (
    <div
      className="api-carousel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false);
      }}
      aria-roledescription="carousel"
      aria-label="GeoAtlas API examples"
    >
      <div className="api-carousel-heading">
        <div>
          <span className="section-kicker">Live API examples</span>
          <h2>See what you can build with GeoAtlas</h2>
        </div>
      </div>

      <div className="api-carousel-stage" aria-live="polite">
        {examples.map((example, index) => {
          const position = positionFor(index);
          return (
            <article
              className={`api-preview-card api-carousel-slide is-${position}`}
              key={example.label}
              aria-hidden={position !== "active"}
            >
              <div className="api-preview-top">
                <span>GET</span>
                <div>
                  <strong>{example.label}</strong>
                  <p>{example.description}</p>
                </div>
                <small>200 OK</small>
              </div>
              <pre className="api-preview-code">{example.code}</pre>
            </article>
          );
        })}
      </div>

    </div>
  );
}
