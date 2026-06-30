import Link from "next/link";

import { SiteShell } from "@/components/marketing";

const endpoints = [
  ["sources", "GET", "/api/v1/public/sources", "Enabled sources ordered by credibility."],
  ["output-sources", "GET", "/api/v1/public/output-sources", "Sources that currently have published items."],
  ["items", "GET", "/api/v1/public/items", "Paginated, enriched intelligence reports."],
  ["item", "GET", "/api/v1/public/items/{item_id}", "One complete report by ID."],
  ["events", "GET", "/api/v1/public/events", "Deduplicated event candidates with risk hints."],
  ["statistics", "GET", "/api/v1/public/statistics", "Aggregate event statistics."],
  ["overview", "GET", "/api/v1/public/overview", "Risk, country, category, and timeline overview."],
  ["export", "GET", "/api/v1/public/export.json", "Combined item and event JSON export."],
];

const itemParameters = [
  ["source_id", "string", "No", "Return items from one source ID."],
  ["limit", "integer", "No", "1–100. Default: 25."],
  ["offset", "integer", "No", "Zero-based offset. Default: 0."],
  ["include_body", "boolean", "No", "Include body text. Default: true."],
  ["deduplicate", "boolean", "No", "Collapse near-duplicate coverage. Default: true."],
  ["since_hours", "integer", "No", "Only reports from the last 1–168 hours."],
];

const eventParameters = [
  ["source_id", "string", "No", "Return events from one source ID."],
  ["risk_hint", "string", "No", "Filter by event risk hint."],
  ["category", "string", "No", "Match a category hint."],
  ["country_code", "string", "No", "Match a two-letter country code such as IN."],
  ["limit", "integer", "No", "1–100. Default: 25."],
];

const itemFields = [
  ["id", "string", "Stable report identifier."],
  ["source", "object", "Source metadata and credibility."],
  ["canonical_url", "string | null", "Original article URL."],
  ["title", "string", "Sanitized report title."],
  ["summary", "string | null", "Enriched concise summary."],
  ["body", "string | null", "Enriched article body when available."],
  ["image_url", "string | null", "Associated image URL."],
  ["published_at", "datetime | null", "UTC ISO 8601 publication time."],
  ["locations", "array", "Normalized names, country codes, coordinates, and confidence."],
  ["risk_level / risk_score", "string | null / integer | null", "Final risk classification and 0–100 score."],
  ["urgency_score / importance_score", "integer | null", "0–100 operational priority signals."],
  ["is_breaking / breaking_reason", "boolean / string | null", "Breaking-news decision and explanation."],
  ["credibility_score / rank_score", "number", "Source credibility and result ranking scores."],
];

function ParameterTable({ rows }: { rows: string[][] }) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <SiteShell active="documentation">
      <div className="docs-layout site-container">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="docs-sidebar-version">API version 1</div>
          <div className="docs-sidebar-group">
            <h3>Start here</h3>
            <div className="docs-sidebar-links">
              <a href="#introduction" className="active">Introduction</a>
              <a href="#base-url">Base URL</a>
              <a href="#authentication">Authentication</a>
              <a href="#limits">Rate limits</a>
            </div>
          </div>
          <div className="docs-sidebar-group">
            <h3>Endpoints</h3>
            <div className="docs-sidebar-links">
              {endpoints.map(([id, , path]) => <a href={`#${id}`} key={id}>{path.replace("/api/v1/public/", "")}</a>)}
            </div>
          </div>
          <div className="docs-sidebar-group">
            <h3>Reference</h3>
            <div className="docs-sidebar-links">
              <a href="#response-schema">Item schema</a>
              <a href="#pagination">Pagination</a>
              <a href="#errors">Errors</a>
            </div>
          </div>
        </aside>

        <article className="docs-copy">
          <section id="introduction" className="docs-section">
            <span className="section-kicker">GeoAtlas public API</span>
            <h1>Developer documentation</h1>
            <p>
              GeoAtlas exposes read-only JSON endpoints for enriched reports, normalized locations, source
              credibility, risk signals, breaking-news decisions, events, and aggregate intelligence views.
            </p>
            <div className="docs-callout">
              <strong>Before you begin</strong>
              <p>Create an account, generate a key in the customer portal, and copy it when shown. Only its prefix is retained for later display.</p>
              <Link href="/register" className="site-button primary">Get a free API key</Link>
            </div>
          </section>

          <section id="base-url" className="docs-section">
            <h2>Base URL</h2>
            <p>Set your deployed GeoAtlas API origin once, then append the paths documented below.</p>
            <pre className="docs-code">GEOATLAS_API_BASE_URL=https://api.your-geoatlas-domain.com</pre>
            <p>All request and response bodies use UTF-8 JSON. Datetimes use ISO 8601 UTC values.</p>
          </section>

          <section id="authentication" className="docs-section">
            <h2>Authentication</h2>
            <p>Send your key in either the <code>X-API-Key</code> header or a Bearer authorization header.</p>
            <pre className="docs-code">{`curl "$GEOATLAS_API_BASE_URL/api/v1/public/items?limit=10" \\
  -H "X-API-Key: geoatlas_live_your_key"

# Equivalent:
Authorization: Bearer geoatlas_live_your_key`}</pre>
            <p>Keys are secrets. Keep them on your server and never commit them or expose them in browser code.</p>
          </section>

          <section id="limits" className="docs-section">
            <h2>Rate limits and quotas</h2>
            <p>The free tier allows 30 requests per rolling minute and 5,000 requests per calendar month. Successful authenticated responses include:</p>
            <ul className="docs-bullets">
              <li><code>X-RateLimit-Limit</code> — allowed requests per minute.</li>
              <li><code>X-RateLimit-Remaining</code> — requests left in the current rolling window.</li>
              <li><code>X-Monthly-Limit</code> — monthly allowance.</li>
              <li><code>X-Monthly-Remaining</code> — remaining requests this month.</li>
            </ul>
            <p>A per-minute quota error includes <code>Retry-After</code>. Monthly usage resets when the calendar month changes in UTC.</p>
          </section>

          <section className="docs-section">
            <h2>Endpoint reference</h2>
            <div className="endpoint-index">
              {endpoints.map(([id, method, path, description]) => (
                <a href={`#${id}`} key={id}><span>{method}</span><code>{path}</code><small>{description}</small></a>
              ))}
            </div>
          </section>

          <section id="sources" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/sources</h2></div>
            <p>Returns all enabled, non-archived sources, ordered by credibility. Each source contains <code>id</code>, <code>name</code>, <code>feed_url</code>, <code>site_url</code>, <code>credibility_score</code>, <code>credibility_tier</code>, and <code>last_success_at</code>.</p>
          </section>

          <section id="output-sources" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/output-sources</h2></div>
            <p>Uses the same source schema, but only returns sources that have at least one normalized item available.</p>
          </section>

          <section id="items" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/items</h2></div>
            <p>Returns newest reports first. When the enrichment pipeline is enabled, only reports with publishable enrichment are returned.</p>
            <h3>Query parameters</h3>
            <ParameterTable rows={itemParameters} />
            <pre className="docs-code">{`curl "$GEOATLAS_API_BASE_URL/api/v1/public/items?since_hours=24&limit=25&deduplicate=true" \\
  -H "X-API-Key: $GEOATLAS_API_KEY"`}</pre>
          </section>

          <section id="item" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/items/{"{item_id}"}</h2></div>
            <p>Returns one complete item with its body. Responds with 404 when the item does not exist, its source is unavailable, or required enrichment is not yet publishable.</p>
          </section>

          <section id="events" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/events</h2></div>
            <p>Returns deduplicated events with title, summary, categories, locations, risk hint, publication status, and creation time.</p>
            <h3>Query parameters</h3>
            <ParameterTable rows={eventParameters} />
          </section>

          <section id="statistics" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/statistics</h2></div>
            <p>Returns aggregate statistics for up to 5,000 recent event rows. Supports optional <code>source_id</code> and <code>limit</code> parameters.</p>
          </section>

          <section id="overview" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/overview</h2></div>
            <p>Returns <code>total_news</code>, <code>high_risk_events</code>, <code>countries_affected</code>, <code>policy_events</code>, <code>overall_risk</code>, a 30-day <code>timeline</code>, category <code>breakdown</code>, and <code>generated_at</code>.</p>
          </section>

          <section id="export" className="docs-section endpoint-section">
            <div className="endpoint-title"><span>GET</span><h2>/api/v1/public/export.json</h2></div>
            <p>Returns <code>items</code> and <code>events</code> in one JSON object. Supports optional <code>source_id</code> and <code>limit</code> from 1–500.</p>
          </section>

          <section id="response-schema" className="docs-section">
            <h2>Item response schema</h2>
            <ParameterTable rows={itemFields.map(([name, type, description]) => [name, type, "—", description])} />
            <p>Nullable fields are part of the stable response shape but are not guaranteed to contain a value for every source item.</p>
          </section>

          <section id="pagination" className="docs-section">
            <h2>Pagination</h2>
            <p>Use the numeric <code>offset</code> with <code>limit</code>. If <code>next_cursor</code> is not null, pass that value as the next request’s offset.</p>
            <pre className="docs-code">GET /api/v1/public/items?limit=25&amp;offset=25</pre>
          </section>

          <section id="errors" className="docs-section">
            <h2>Errors</h2>
            <ParameterTable rows={[
              ["400", "Bad request", "—", "Invalid parameter or portal operation."],
              ["401", "Unauthorized", "—", "Missing or invalid API key/session."],
              ["403", "Forbidden", "—", "Account inactive or admin access required."],
              ["404", "Not found", "—", "Resource unavailable or not publishable."],
              ["429", "Quota exceeded", "—", "Per-minute or monthly quota exhausted."],
              ["500", "Server error", "—", "Unexpected service failure."],
            ]} />
            <pre className="docs-code">{`{
  "detail": "Per-minute API quota exceeded."
}`}</pre>
          </section>
        </article>

        <aside className="docs-preview">
          <div className="docs-preview-sticky">
            <span className="section-kicker">Quick start</span>
            <h2>First request</h2>
            <pre className="docs-code">{`curl "$GEOATLAS_API_BASE_URL/api/v1/public/items?limit=1" \\
  -H "X-API-Key: $GEOATLAS_API_KEY"`}</pre>
            <h3>JavaScript</h3>
            <pre className="docs-code">{`const response = await fetch(
  \`\${baseUrl}/api/v1/public/items?limit=10\`,
  { headers: { "X-API-Key": apiKey } }
);

if (!response.ok) {
  throw new Error(\`GeoAtlas: \${response.status}\`);
}

const data = await response.json();`}</pre>
            <h3>Python</h3>
            <pre className="docs-code">{`import requests

response = requests.get(
    f"{base_url}/api/v1/public/items",
    params={"limit": 10, "since_hours": 24},
    headers={"X-API-Key": api_key},
    timeout=20,
)
response.raise_for_status()
data = response.json()`}</pre>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
