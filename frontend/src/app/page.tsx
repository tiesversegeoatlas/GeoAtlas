import { HeroSection } from "@/components/home/HeroSection";
import { StatsSection } from "@/components/home/StatsSection";
import { HotspotsSection } from "@/components/home/HotspotsSection";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { RecentAlerts } from "@/components/home/RecentAlerts";
import { Footer } from "@/components/layout/Footer";
import { TopNavbar } from "@/components/layout/TopNavbar";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavbar />
      <main className="flex-1">
        <HeroSection />
        <RecentAlerts />
        <StatsSection />
        <HotspotsSection />
        <FeatureGrid />
      </main>
      <Footer />
    </div>
  );
}
