"use client";

import { useFilterStore } from "@/stores/filterStore";
import { EventCategory, RiskLevel } from "@/types";
import { CATEGORY_LABELS, REGIONS } from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function FeedFilters() {
  const {
    categories,
    riskLevels,
    toggleCategory,
    toggleRiskLevel,
    resetFilters
  } = useFilterStore();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Intelligence Filters</h3>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-[10px] uppercase font-bold text-muted-foreground">
            Reset
          </Button>
        </div>
        <Separator className="bg-border/50" />
      </div>

      <div className="space-y-4">
        <Label className="text-xs font-bold uppercase text-muted-foreground">Risk Level</Label>
        <div className="grid grid-cols-2 gap-3">
          {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((level) => (
            <div key={level} className="flex items-center space-x-2">
              <Checkbox
                id={level}
                checked={riskLevels.includes(level)}
                onCheckedChange={() => toggleRiskLevel(level)}
              />
              <label htmlFor={level} className="text-xs font-medium capitalize cursor-pointer">
                {level}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-xs font-bold uppercase text-muted-foreground">Categories</Label>
        <div className="space-y-2.5">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center space-x-2">
              <Checkbox
                id={key}
                checked={categories.includes(key as EventCategory)}
                onCheckedChange={() => toggleCategory(key as EventCategory)}
              />
              <label htmlFor={key} className="text-xs font-medium cursor-pointer">
                {label}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-xs font-bold uppercase text-muted-foreground">Region</Label>
        <Select>
          <SelectTrigger className="bg-background/50 border-border text-xs h-9">
            <SelectValue placeholder="All Regions" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {REGIONS.map(region => (
              <SelectItem key={region} value={region} className="text-xs">
                {region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
