import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoAtlas Commercial API Portal",
  description: "Standalone commercial developer portal for GeoAtlas API customers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
