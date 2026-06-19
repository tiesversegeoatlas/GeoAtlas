import { GeoEvent, CountryProfile, IntelReport, IntelCluster } from "@/types";

export const mockCountries: CountryProfile[] = [
  { code: 'UA', name: 'Ukraine', region: 'Eastern Europe', riskScore: 95, activeEventsCount: 12, description: 'Active conventional warfare following Russian invasion.' },
  { code: 'IL', name: 'Israel', region: 'Middle East', riskScore: 92, activeEventsCount: 8, description: 'Ongoing conflict with Hamas and regional tensions.' },
  { code: 'TW', name: 'Taiwan', region: 'East Asia', riskScore: 78, activeEventsCount: 4, description: 'Strategic tensions in the Taiwan Strait.' },
  { code: 'SD', name: 'Sudan', region: 'East Africa', riskScore: 88, activeEventsCount: 6, description: 'Internal power struggle and humanitarian crisis.' },
  { code: 'MM', name: 'Myanmar', region: 'Southeast Asia', riskScore: 82, activeEventsCount: 5, description: 'Ongoing civil war following 2021 coup.' },
  { code: 'YE', name: 'Yemen', region: 'Middle East', riskScore: 85, activeEventsCount: 4, description: 'Red Sea security threats and long-standing civil conflict.' },
  { code: 'NE', name: 'Niger', region: 'Sahel', riskScore: 80, activeEventsCount: 3, description: 'Post-coup instability and regional security challenges.' },
  { code: 'ML', name: 'Mali', region: 'Sahel', riskScore: 84, activeEventsCount: 5, description: 'Terrorist insurgency and political transition.' },
  { code: 'IR', name: 'Iran', region: 'Middle East', riskScore: 75, activeEventsCount: 4, description: 'Regional proxy influence and internal unrest.' },
  { code: 'PK', name: 'Pakistan', region: 'South Asia', riskScore: 72, activeEventsCount: 6, description: 'Border tensions and domestic political instability.' },
];

export const mockEvents: GeoEvent[] = [
  {
    id: 'e1',
    title: 'Kharkiv Offensive Operations',
    summary: 'Intensified shelling and ground incursions in the Kharkiv northern border region.',
    description: 'Russian forces have launched a new offensive axis targeting border settlements north of Kharkiv. Intelligence suggests a goal of creating a buffer zone to prevent Ukrainian strikes on Belgorod.',
    country: 'Ukraine',
    region: 'Kharkiv Oblast',
    latitude: 50.0642,
    longitude: 36.2348,
    category: 'war',
    riskLevel: 'critical',
    verificationStatus: 'verified',
    timestamp: '2024-05-15T08:00:00Z',
    lastUpdated: '2024-05-16T10:30:00Z',
    timeline: [
      { date: '2024-05-15 05:00', description: 'Initial artillery barrage detected across the border.' },
      { date: '2024-05-15 07:30', description: 'Small infantry groups reported crossing near Vovchansk.' },
      { date: '2024-05-16 09:00', description: 'Evacuation of civilians from border towns confirmed by local authorities.' },
    ],
    sources: [
      { name: 'General Staff of the Armed Forces of Ukraine', url: 'https://facebook.com/GeneralStaff.ua' },
      { name: 'DeepStateMap.Live', url: 'https://deepstatemap.live' },
    ],
    confidenceScore: 95,
    relatedEventIds: ['e2', 'e3'],
  },
  {
    id: 'e2',
    title: 'Red Sea Merchant Vessel Strike',
    summary: 'Container ship targeted by anti-ship ballistic missile in the Bab al-Mandab Strait.',
    description: 'A commercial vessel transiting south through the Red Sea reported an explosion in close proximity. Houthi rebels have claimed responsibility as part of their campaign against international shipping.',
    country: 'Yemen',
    region: 'Red Sea',
    latitude: 12.5833,
    longitude: 43.3333,
    category: 'terrorism',
    riskLevel: 'high',
    verificationStatus: 'verified',
    timestamp: '2024-05-14T14:20:00Z',
    lastUpdated: '2024-05-15T09:15:00Z',
    timeline: [
      { date: '2024-05-14 14:15', description: 'Vessel sends distress signal reporting missile attack.' },
      { date: '2024-05-14 16:00', description: 'US Central Command confirms launch of two ASBMs.' },
    ],
    sources: [
      { name: 'UKMTO', url: 'https://ukmto.org' },
      { name: 'CENTCOM', url: 'https://centcom.mil' },
    ],
    confidenceScore: 92,
    relatedEventIds: [],
  },
  {
    id: 'e3',
    title: 'Taipei Cyber Attack',
    summary: 'Coordinated DDoS attack on Taiwanese financial infrastructure.',
    description: 'Major banks in Taipei reported intermittent service disruptions. Cybersecurity analysts trace the traffic to botnets potentially linked to state-sponsored actors.',
    country: 'Taiwan',
    region: 'Taipei',
    latitude: 25.0330,
    longitude: 121.5654,
    category: 'cyber',
    riskLevel: 'medium',
    verificationStatus: 'investigating',
    timestamp: '2024-05-16T11:00:00Z',
    lastUpdated: '2024-05-16T14:00:00Z',
    timeline: [
      { date: '2024-05-16 11:00', description: 'Service disruptions reported by customers of 3 major banks.' },
      { date: '2024-05-16 13:30', description: 'National Security Council convenes emergency cyber-defense meeting.' },
    ],
    sources: [
      { name: 'Taiwan Digital Affairs Ministry', url: 'https://moda.gov.tw' },
    ],
    confidenceScore: 70,
    relatedEventIds: [],
  },
  // Adding more mock events to reach 50. Use deterministic values to avoid
  // SSR/client hydration mismatches (avoid Math.random()/Date.now() at import).
  ...(() => {
    const BASE_DATE = new Date('2026-06-10T20:59:00Z');

    return Array.from({ length: 47 }).map((_, i) => ({
      id: `e${i + 4}`,
      title: `Geopolitical Event ${i + 4}`,
      summary: `Summary of event ${i + 4} regarding regional instability.`,
      description: `Detailed description of the geopolitical developments in event ${i + 4}. This involves various actors and strategic interests.`,
      country: ['Sudan', 'Mali', 'Niger', 'Israel', 'Gaza', 'Iran', 'South China Sea', 'Venezuela'][i % 8],
      region: 'Various',
      latitude: 10 + ((i * 13) % 40),
      longitude: 10 + ((i * 29) % 100),
      category: (['conflict', 'humanitarian', 'political', 'unrest', 'military'][i % 5]) as unknown as import('@/types').EventCategory,
      riskLevel: (['high', 'medium', 'low', 'critical'][i % 4]) as unknown as import('@/types').RiskLevel,
      verificationStatus: (['verified', 'unverified', 'investigating'][i % 3]) as unknown as import('@/types').VerificationStatus,
      timestamp: new Date(BASE_DATE.getTime() - i * 60 * 60 * 1000).toISOString(),
      lastUpdated: new Date(BASE_DATE.getTime() - i * 30 * 60 * 1000).toISOString(),
      timeline: [],
      sources: [{ name: 'OSINT Source', url: '#' }],
      confidenceScore: 60 + ((i * 7) % 31),
      relatedEventIds: [],
    }));
  })()
];

export const mockReports: IntelReport[] = [
  { id: 'r1', title: 'Sahel Security Outlook 2024', summary: 'Analysis of jihadist movements in Mali and Niger.', author: 'Dr. Sarah Jenkins', date: '2024-04-20', category: 'terrorism', tags: ['Sahel', 'ISIS', 'Al-Qaeda'], restricted: false },
  { id: 'r2', title: 'Black Sea Naval Capabilities', summary: 'Shift in maritime balance following drone warfare.', author: 'Admiral James Cook', date: '2024-05-01', category: 'military', tags: ['Black Sea', 'Drones', 'Naval'], restricted: true },
  { id: 'r3', title: 'Energy Infrastructure Vulnerabilities', summary: 'Global assessment of pipeline security threats.', author: 'Energy Research Group', date: '2024-05-10', category: 'cyber', tags: ['Energy', 'Critical Infrastructure'], restricted: false },
];

export const mockClusters: IntelCluster[] = [
  { id: 'c1', name: 'Middle East Conflict Arc', description: 'Connected conflicts involving Israel, Hezbollah, and Houthis.', eventIds: ['e2'], riskLevel: 'critical', region: 'Middle East' },
  { id: 'c2', name: 'Sahel Insurgency', description: 'Cross-border terrorist activity in West Africa.', eventIds: [], riskLevel: 'high', region: 'Sahel' },
];
