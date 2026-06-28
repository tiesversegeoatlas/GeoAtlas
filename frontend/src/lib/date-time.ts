function normalizeTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const iso = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const hasTime = /^\d{4}-\d{2}-\d{2}T/.test(iso);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return hasTime && !hasZone ? `${iso}Z` : iso;
}

export function parseTimestamp(value: string) {
  return new Date(normalizeTimestamp(value));
}

export function formatUserDateTime(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatUserMonthYear(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatUserTime(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
}
