import Link from "next/link";

import { CodeExamplePanel, SiteShell } from "@/components/marketing";

const filters = [
  {
    title: "Keywords and phrases",
    text: "Search with singular keywords, quoted phrases, or country tags to isolate the exact topic you care about.",
  },
  {
    title: "Dates and timeframes",
    text: "Filter recent developments, look at a fixed incident window, or pin your queries to the latest 24 hours.",
  },
  {
    title: "Publishers and locations",
    text: "Focus on trusted sources, specific countries, or location-tagged reports relevant to your monitor.",
  },
  {
    title: "Languages and regions",
    text: "Constrain the feed by language, regional focus, or cross-border coverage patterns.",
  },
];

export default function HomePage() {
  return (
    <SiteShell active="get-started">
      <section className="hero-section site-container">
        <div className="hero-copy">
          <span className="section-kicker">GeoAtlas commercial API</span>
          <h1>Global intelligence data, structured for your application.</h1>
          <p>
            Query global articles, summaries, enriched body content, locations, source credibility, and breaking-news
            flags through a standalone commercial portal that matches the GeoAtlas product ecosystem.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="site-button primary">Get API key</Link>
            <Link href="/documentation" className="site-button ghost">Read documentation</Link>
          </div>
        </div>
      </section>

      <section className="site-section site-container preview-stage">
        <CodeExamplePanel />
      </section>

      <section className="site-section site-container brand-strip">
        <p>Trusted for developer-facing intelligence products, analyst desks, and alerting workflows.</p>
        <div className="brand-strip-grid">
          <span>Geo Risk Teams</span>
          <span>Energy Security</span>
          <span>Policy Labs</span>
          <span>Trade Monitors</span>
          <span>OSINT Dashboards</span>
        </div>
      </section>

      <section className="site-section site-container feature-grid">
        <article className="marketing-card">
          <div className="marketing-icon">◎</div>
          <h2>Worldwide scale</h2>
          <p>Search across international reporting with normalized metadata, location extraction, and structured feed output.</p>
        </article>
        <article className="marketing-card">
          <div className="marketing-icon">⌘</div>
          <h2>Easy integration</h2>
          <p>Drop the API into scripts, dashboards, alerting pipelines, and commercial analyst products with straightforward HTTP calls.</p>
        </article>
        <article className="marketing-card">
          <div className="marketing-icon">⚑</div>
          <h2>Built for monitoring</h2>
          <p>Use risk scores, breaking flags, and cleaner location tags to power live intelligence feeds and operational maps.</p>
        </article>
      </section>

      <section className="site-section site-container filter-section">
        <div className="filter-header">
          <span className="section-kicker">Filter power</span>
          <h2>Use powerful search and filter options</h2>
        </div>
        <div className="filter-list">
          {filters.map((filter, index) => (
            <div key={filter.title} className="filter-row">
              <div className="filter-visual">{index + 1}</div>
              <div className="filter-copy">
                <h3>{filter.title}</h3>
                <p>{filter.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section site-container testimonial-grid">
        <article className="testimonial-card">
          <strong>Analyst teams</strong>
          <p>“The API structure is simple enough for engineering, but the metadata is rich enough for actual monitoring operations.”</p>
          <span>Commercial intelligence workflow</span>
        </article>
        <article className="testimonial-card">
          <strong>Platform builders</strong>
          <p>“The standalone portal makes key issuance, billing, and plan control much cleaner for a sellable API product.”</p>
          <span>Developer product use case</span>
        </article>
        <article className="testimonial-card">
          <strong>GeoAtlas ecosystem</strong>
          <p>“The styling feels like GeoAtlas rather than a generic docs template, which keeps the brand continuity intact.”</p>
          <span>Product consistency</span>
        </article>
      </section>
    </SiteShell>
  );
}
