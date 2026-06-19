# WarWatch | Geo-Intelligence & Conflict Monitoring Platform

WarWatch is a production-ready, enterprise-grade frontend for a Geopolitical Intelligence and Conflict Monitoring Platform. It provides researchers, journalists, and security analysts with real-time situational awareness through data-dense dashboards, interactive global maps, and verified intelligence feeds.

## 🚀 Key Features

- **Intelligence Feed**: Real-time stream of verified geopolitical events with advanced filtering by risk level, category, and region.
- **Global Risk Map**: Interactive spatial visualization using Leaflet.js with custom risk-level markers and sector-based insights.
- **Strategic Dashboard**: High-density analytical widgets and charts (Recharts) visualizing trends and risk distributions.
- **Database Management**: Administrative portal for intelligence entry and multi-tier verification cycles.
- **Enterprise UI/UX**: Professional dark theme inspired by Bloomberg terminals, featuring smooth animations and responsive design.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Animations**: Framer Motion
- **Maps**: Leaflet.js / React Leaflet
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod

## 📁 Project Structure

```text
src/
├── app/                  # Next.js App Router (Pages & Layouts)
├── components/           # UI Components (Feature-based & Shared)
│   ├── layout/           # Sidebar, Navbar, AppLayout
│   ├── home/             # Landing Page sections
│   ├── feed/             # Intel Feed components
│   ├── map/              # Leaflet integration
│   ├── dashboard/        # Analytics widgets
│   └── ui/               # shadcn/ui primitives
├── stores/               # Zustand state management
├── data/                 # Realistic mock datasets (50+ events)
├── types/                # Strict TypeScript interfaces
└── lib/                  # Utilities and constants
```

## 🏁 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## 🔒 Verification Tiers

The platform implements a 3-tier verification system:
- **Tier 1**: Initial OSINT report / Ground report
- **Tier 2**: Cross-referenced with satellite imagery or secondary sources
- **Tier 3**: Final intelligence validation and database commitment

---
Developed by **WarWatch Intelligence Systems**.
