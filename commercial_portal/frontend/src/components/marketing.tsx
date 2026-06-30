import Link from "next/link";
import type { ReactNode } from "react";
import { ApiPreviewCarousel } from "@/components/ApiPreviewCarousel";

type NavKey = "get-started" | "documentation" | "pricing" | "login" | "portal" | "admin";

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9" />
    </svg>
  );
}

function NavIcon({ type }: { type: "home" | "docs" | "pricing" | "portal" }) {
  if (type === "docs") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z" /><path d="M8 20V7.5a3 3 0 0 0-3-3M9 9h5M9 13h5" /></svg>;
  }
  if (type === "pricing") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 3v4M17 3v4M5 7v13h14V7M8 11h3M8 15h7" /></svg>;
  }
  if (type === "portal") {
    return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" /></svg>;
}

const navigation = [
  { key: "get-started" as const, href: "/", label: "Get started", icon: "home" as const },
  { key: "documentation" as const, href: "/documentation", label: "Documentation", icon: "docs" as const },
  { key: "pricing" as const, href: "/pricing", label: "Pricing", icon: "pricing" as const },
  { key: "portal" as const, href: "/portal", label: "Customer Portal", icon: "portal" as const },
];

export function SiteShell({
  active,
  children,
}: {
  active: NavKey;
  children: ReactNode;
}) {
  return (
    <main className="atlas-commercial-shell">
      <CommercialSidebar active={active} />
      <section className="atlas-commercial-main">
        <CommercialTopbar active={active} />
        {children}
        <SiteFooter />
      </section>
    </main>
  );
}

export function PortalShell({
  active,
  children,
}: {
  active: NavKey;
  children: ReactNode;
}) {
  return (
    <main className="atlas-commercial-shell">
      <CommercialSidebar active={active} />
      <section className="atlas-commercial-main">
        <CommercialTopbar active={active} />
        {children}
      </section>
    </main>
  );
}

function CommercialSidebar({ active }: { active: NavKey }) {
  return (
    <aside className="commercial-sidebar">
      <Link href="/" className="commercial-brand">
        <span className="commercial-brand-orbit"><GlobeIcon /></span>
        <span className="commercial-brand-copy"><strong>Geo Atlas</strong><small>by Ties</small></span>
      </Link>

      <nav className="commercial-nav" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""}>
            <NavIcon type={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <section className="commercial-sidebar-section">
        <span className="commercial-sidebar-label">Workspace</span>
        <strong>Developer Intelligence API</strong>
        <p>Global reports, location intelligence, risk signals, and breaking-news decisions through one API.</p>
      </section>

      <div className="commercial-sidebar-profile">
        <span className="commercial-avatar">GA</span>
        <span><strong>GeoAtlas API</strong><small>Commercial public service</small></span>
      </div>
    </aside>
  );
}

function CommercialTopbar({ active }: { active: NavKey }) {
  const label =
    active === "documentation" ? "API Documentation" :
    active === "pricing" ? "Pricing & limits" :
    active === "portal" ? "Customer dashboard" :
    active === "admin" ? "Commercial backoffice" :
    active === "login" ? "Account access" :
    "Developer platform";

  return (
    <header className="commercial-topbar">
      <div>
        <span className="commercial-topbar-kicker">GEOATLAS INTELLIGENCE</span>
        <strong>{label}</strong>
      </div>
      <div className="commercial-topbar-actions">
        <Link href="/documentation">Docs</Link>
        <Link href="/login">Sign in</Link>
        <Link href="/register" className="commercial-primary-action">Get API key</Link>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer site-container">
      <div>
        <strong>Geo Atlas</strong>
        <span>Structured global intelligence for developer products.</span>
      </div>
      <nav>
        <Link href="/documentation">Documentation</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/login">Customer portal</Link>
      </nav>
    </footer>
  );
}

export function CodeExamplePanel() {
  return <ApiPreviewCarousel />;
}
