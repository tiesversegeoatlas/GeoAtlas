"use client";

import { Globe, Mail } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-12 border-t border-border bg-card/30">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
                <Globe className="w-5 h-5" />
              </div>
              <span>GEOATLAS</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Global intelligence and conflict monitoring platform. Providing actionable situational awareness for security professionals worldwide.
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/" className="hover:text-primary">Live Feed</Link></li>
              <li><Link href="/" className="hover:text-primary">Global Map</Link></li>
              <li><Link href="/" className="hover:text-primary">Analytics</Link></li>
              <li><Link href="/" className="hover:text-primary">Reports</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="#" className="hover:text-primary">Documentation</Link></li>
              <li><Link href="#" className="hover:text-primary">API Access</Link></li>
              <li><Link href="#" className="hover:text-primary">Verification Methodology</Link></li>
              <li><Link href="#" className="hover:text-primary">Open Source Intel</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">Contact</h4>
            <div className="flex gap-4 mb-4">
              <Link href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 transition-colors">
                <Globe className="w-4 h-4" />
              </Link>
              <Link href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 transition-colors">
                <Mail className="w-4 h-4" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2026 GeoAtlas. Live data is supplied by the GeoAtlas collection API.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
