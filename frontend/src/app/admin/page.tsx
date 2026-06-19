"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, ExternalLink, Rss, ScrollText } from "lucide-react";

const backendUrl = process.env.NEXT_PUBLIC_GEOATLAS_CONSOLE_URL || "http://127.0.0.1:8000";

export default function AdminPage() {
  return (
    <AppLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GeoAtlas Operations</h1>
            <p className="text-muted-foreground">Source ingestion remains isolated in the existing backend operations console.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <Rss className="w-7 h-7 text-primary mb-2" />
              <CardTitle>Source Collection Console</CardTitle>
              <CardDescription>Add feeds, check health, run RSS ingestion or URL scraping, and inspect output.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="gap-2">
                <a href={backendUrl} target="_blank" rel="noreferrer">
                  Open collection console <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <ScrollText className="w-7 h-7 text-primary mb-2" />
              <CardTitle>Backend API Documentation</CardTitle>
              <CardDescription>Inspect the live standalone API contract and test public endpoints.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="gap-2">
                <a href={`${backendUrl}/docs`} target="_blank" rel="noreferrer">
                  Open API docs <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
