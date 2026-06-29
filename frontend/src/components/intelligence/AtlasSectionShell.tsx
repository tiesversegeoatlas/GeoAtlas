"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, Home, Map, Newspaper, Search } from "lucide-react";
import { ReactNode } from "react";

const links = [
  ["/", "Overview", Home],
  ["/live-map", "Live Map", Map],
  ["/news", "News & Intel", Newspaper],
] as const;

export function AtlasSectionShell({
  children,
  title,
  subtitle,
  search,
  onSearch,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  search?: string;
  onSearch?: (value: string) => void;
}) {
  const pathname = usePathname();

  return (
    <main className="atlas-shell atlas-routed-shell">
      <aside className="atlas-sidebar">
        <Link className="atlas-brand" href="/">
          <div className="atlas-brand-orbit">
            <Globe2 />
          </div>
          <div>
            <strong>Geo Atlas</strong>
            <span>by Ties</span>
          </div>
        </Link>
        <nav className="atlas-nav">
          {links.map(([href, label, Icon]) => (
            <Link key={label} href={href} className={pathname === href ? "active" : ""}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <section className="atlas-sidebar-section atlas-sidebar-intro">
          <span className="atlas-sidebar-label">GeoAtlas</span>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </section>
        <div className="atlas-sidebar-profile">
          <div className="atlas-avatar">GA</div>
          <div>
            <strong>GeoAtlas Ops</strong>
            <span>Public intelligence service</span>
          </div>
        </div>
      </aside>
      <section className="atlas-main">
        <header className="atlas-topbar atlas-page-topbar">
          {onSearch ? (
            <label className="atlas-search">
              <Search />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search all collected intelligence..."
              />
            </label>
          ) : (
            <Link href="/" className="atlas-page-back">
              ← Command center
            </Link>
          )}
        </header>
        <div className="atlas-page-heading">
          <div>
            <span>GEOATLAS INTELLIGENCE</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
