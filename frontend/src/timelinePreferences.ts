export const timelineModes = [
  { value: "list", label: "经典列表" },
  { value: "axis", label: "中轴编年" },
  { value: "scatter", label: "散点概览" },
] as const;

export type TimelineMode = (typeof timelineModes)[number]["value"];
export type TimelineEra = { year: number; name: string };

export const timelineModeKey = "aethercod-timeline-mode";

export function readTimelineMode(): TimelineMode {
  const stored = localStorage.getItem(timelineModeKey);
  return timelineModes.find(({ value }) => value === stored)?.value ?? "list";
}

export function parseTimelineYear(value: string) {
  if (!value.trim()) return null;
  if (!/^[+-]?\d+$/.test(value.trim())) return Number.NaN;
  const year = Number(value);
  return Number.isSafeInteger(year) ? year : Number.NaN;
}

const eraKey = (path: string) => `aethercod-timeline-eras:${path}`;

export function readTimelineEras(path: string): TimelineEra[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(eraKey(path)) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is TimelineEra =>
      item && Number.isSafeInteger(item.year) && typeof item.name === "string" && Boolean(item.name.trim()),
    ).sort((left, right) => left.year - right.year);
  } catch {
    return [];
  }
}

export function writeTimelineEras(path: string, eras: TimelineEra[]) {
  localStorage.setItem(eraKey(path), JSON.stringify(eras));
}
