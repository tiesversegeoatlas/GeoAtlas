"use client";

import { EventForm } from "@/components/admin/EventForm";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  ShieldAlert, 
  PlusCircle, 
  FileCheck, 
  Settings,
  Database
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

export default function AdminPage() {
  return (
    <AppLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Intelligence Database</h1>
              <p className="text-muted-foreground font-medium">Manage global event data and verification cycles</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="add-event" className="space-y-6">
          <TabsList className="bg-card border border-border p-1 h-12">
            <TabsTrigger value="add-event" className="gap-2 px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
              <PlusCircle className="w-4 h-4" /> 
              Register New Event
            </TabsTrigger>
            <TabsTrigger value="manage" className="gap-2 px-6">
              <ShieldAlert className="w-4 h-4" /> 
              Active Monitoring
            </TabsTrigger>
            <TabsTrigger value="verify" className="gap-2 px-6">
              <FileCheck className="w-4 h-4" /> 
              Verification Queue
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 px-6">
              <Settings className="w-4 h-4" /> 
              System Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="add-event">
            <Card className="bg-card border-border shadow-2xl">
              <CardHeader className="border-b border-border bg-white/5">
                <CardTitle>Intelligence Entry Portal</CardTitle>
                <CardDescription>
                  Manually input tactical developments or strategic geopolitical shifts into the global feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <EventForm />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage">
            <div className="py-24 text-center border-2 border-dashed border-border rounded-xl bg-card/30">
              <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-bold">Database Management Module</h3>
              <p className="text-muted-foreground">Detailed event table and bulk editing tools are loading...</p>
            </div>
          </TabsContent>
          
          <TabsContent value="verify">
            <div className="py-24 text-center border-2 border-dashed border-border rounded-xl bg-card/30">
              <FileCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-bold">Verification Module</h3>
              <p className="text-muted-foreground">3-tier review system for pending tactical reports.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
