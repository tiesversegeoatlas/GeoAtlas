import { create } from "zustand";
import { EventCategory, GeoEvent, RiskLevel } from "@/types";
import { fetchEvent, fetchEvents } from "@/lib/geoatlas-api";

interface EventState {
  events: GeoEvent[];
  filteredEvents: GeoEvent[];
  selectedEvent: GeoEvent | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  loadEvents: (force?: boolean) => Promise<void>;
  loadEvent: (id: string) => Promise<GeoEvent | null>;
  setSearchQuery: (query: string) => void;
  setSelectedEvent: (event: GeoEvent | null) => void;
  filterEvents: (filters: {
    category?: EventCategory[];
    riskLevel?: RiskLevel[];
    region?: string;
    country?: string;
  }) => void;
}

let activeLoad: Promise<void> | null = null;
let refreshTimer: number | null = null;

function ensureAutoRefresh(loadEvents: (force?: boolean) => Promise<void>) {
  if (typeof window === "undefined" || refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    void loadEvents(true);
  }, 60_000);
}

function searchEvents(events: GeoEvent[], query: string): GeoEvent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return events;
  return events.filter((event) =>
    [event.title, event.summary, event.country, event.region, event.category]
      .some((value) => value.toLowerCase().includes(normalized))
  );
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  filteredEvents: [],
  selectedEvent: null,
  loading: false,
  error: null,
  searchQuery: "",

  loadEvents: async (force = false) => {
    if (!force && get().events.length) return;
    if (activeLoad) return activeLoad;
    set({ loading: true, error: null });
    activeLoad = fetchEvents()
      .then((events) => {
        set({
          events,
          filteredEvents: searchEvents(events, get().searchQuery),
          loading: false,
        });
        ensureAutoRefresh(get().loadEvents);
      })
      .catch((error: Error) => {
        set({ loading: false, error: error.message });
      })
      .finally(() => {
        activeLoad = null;
      });
    return activeLoad;
  },

  loadEvent: async (id) => {
    const existing = get().events.find((event) => event.id === id);
    if (existing) return existing;
    try {
      const event = await fetchEvent(id);
      set((state) => ({
        events: [event, ...state.events],
        filteredEvents: [event, ...state.filteredEvents],
      }));
      return event;
    } catch {
      return null;
    }
  },

  setSearchQuery: (query) => {
    set({
      searchQuery: query,
      filteredEvents: searchEvents(get().events, query),
    });
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  filterEvents: (filters) => {
    let filtered = searchEvents(get().events, get().searchQuery);
    if (filters.category?.length) {
      filtered = filtered.filter((event) => filters.category?.includes(event.category));
    }
    if (filters.riskLevel?.length) {
      filtered = filtered.filter((event) => filters.riskLevel?.includes(event.riskLevel));
    }
    if (filters.region) {
      filtered = filtered.filter((event) => event.region === filters.region);
    }
    if (filters.country) {
      filtered = filtered.filter((event) => event.country === filters.country);
    }
    set({ filteredEvents: filtered });
  },
}));
