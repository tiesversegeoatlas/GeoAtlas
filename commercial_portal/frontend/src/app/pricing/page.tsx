import { SiteShell } from "@/components/marketing";

const plans = [
  {
    name: "Free",
    price: "INR 0",
    tagline: "The currently available GeoAtlas API tier",
    accent: "green",
    cta: "Create free account",
    features: ["5,000 requests per calendar month", "30 requests per minute", "2 active API keys", "All current public API endpoints", "Self-service key management"],
  },
];

const faqs = [
  ["What counts as one request?", "Any single HTTP request to the public API counts as one request, regardless of how many fields are returned."],
  ["Can I use the free tier in production?", "The free tier is currently the only self-service tier. Contact GeoAtlas before high-volume or business-critical production use."],
  ["Does every response include body and summary fields?", "The fields are always present in item responses, but may be null when source material or enrichment is unavailable."],
  ["What happens when I hit the monthly quota?", "Usage is capped for the plan unless a higher tier or commercial billing arrangement is enabled from the backoffice."],
];

export default function PricingPage() {
  return (
    <SiteShell active="pricing">
      <section className="site-section site-container pricing-hero">
        <span className="section-kicker">Pricing</span>
        <h1>Free for development, with commercial paths for serious usage.</h1>
        <p>
          Start with the free tier today. Additional commercial tiers will be published only when their pricing,
          limits, support scope, and service commitments are finalized.
        </p>
      </section>

      <section className="site-section site-container pricing-grid">
        {plans.map((plan) => (
          <article key={plan.name} className={`pricing-card pricing-${plan.accent}`}>
            <div className="pricing-card-top">
              <h2>{plan.name}</h2>
              <strong>{plan.price}</strong>
              <p>{plan.tagline}</p>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a className="site-button primary" href="/register">{plan.cta}</a>
          </article>
        ))}
      </section>

      <section className="site-section site-container brand-strip">
        <p>Trusted for intelligence workflows, API products, and analyst operations.</p>
        <div className="brand-strip-grid">
          <span>Policy Desks</span>
          <span>Energy Monitors</span>
          <span>Security Teams</span>
          <span>Research Platforms</span>
          <span>OSINT Products</span>
        </div>
      </section>

      <section className="site-section site-container faq-card">
        <span className="section-kicker">FAQs</span>
        <h2>Commercial API questions</h2>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <div key={question} className="faq-item">
              <h3>{question}</h3>
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
