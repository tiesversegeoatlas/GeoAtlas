import { create } from 'zustand';
import { RiskLevel, EventCategory } from '@/types';

interface FilterState {
  categories: EventCategory[];
  riskLevels: RiskLevel[];
  regions: string[];
  countries: string[];
  dateRange: { from?: Date; to?: Date };

  toggleCategory: (category: EventCategory) => void;
  toggleRiskLevel: (risk: RiskLevel) => void;
  setRegions: (regions: string[]) => void;
  setCountries: (countries: string[]) => void;
  setDateRange: (range: { from?: Date; to?: Date }) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  categories: [],
  riskLevels: [],
  regions: [],
  countries: [],
  dateRange: {},

  toggleCategory: (category) => set((state) => ({
    categories: state.categories.includes(category)
      ? state.categories.filter((c) => c !== category)
      : [...state.categories, category],
  })),

  toggleRiskLevel: (risk) => set((state) => ({
    riskLevels: state.riskLevels.includes(risk)
      ? state.riskLevels.filter((r) => r !== risk)
      : [...state.riskLevels, risk],
  })),

  setRegions: (regions) => set({ regions }),
  setCountries: (countries) => set({ countries }),
  setDateRange: (dateRange) => set({ dateRange }),
  resetFilters: () => set({ categories: [], riskLevels: [], regions: [], countries: [], dateRange: {} }),
}));
