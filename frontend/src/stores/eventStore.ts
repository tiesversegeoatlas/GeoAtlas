import { create } from 'zustand';
import { GeoEvent, RiskLevel, EventCategory } from '@/types';
import { mockEvents } from '@/data/mockData';

interface EventState {
  events: GeoEvent[];
  filteredEvents: GeoEvent[];
  selectedEvent: GeoEvent | null;
  loading: boolean;
  searchQuery: string;
  
  setSearchQuery: (query: string) => void;
  setSelectedEvent: (event: GeoEvent | null) => void;
  filterEvents: (filters: { 
    category?: EventCategory[]; 
    riskLevel?: RiskLevel[]; 
    region?: string;
    country?: string;
  }) => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: mockEvents,
  filteredEvents: mockEvents,
  selectedEvent: null,
  loading: false,
  searchQuery: '',

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    const { events } = get();
    if (!query) {
      set({ filteredEvents: events });
      return;
    }
    const filtered = events.filter(e => 
      e.title.toLowerCase().includes(query.toLowerCase()) || 
      e.summary.toLowerCase().includes(query.toLowerCase()) ||
      e.country.toLowerCase().includes(query.toLowerCase())
    );
    set({ filteredEvents: filtered });
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  filterEvents: (filters) => {
    const { events } = get();
    let filtered = [...events];

    if (filters.category && filters.category.length > 0) {
      filtered = filtered.filter(e => filters.category!.includes(e.category));
    }

    if (filters.riskLevel && filters.riskLevel.length > 0) {
      filtered = filtered.filter(e => filters.riskLevel!.includes(e.riskLevel));
    }

    if (filters.region) {
      filtered = filtered.filter(e => e.region === filters.region);
    }

    if (filters.country) {
      filtered = filtered.filter(e => e.country === filters.country);
    }

    set({ filteredEvents: filtered });
  }
}));
