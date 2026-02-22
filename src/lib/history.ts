// ============================================================
// BreathEasy SG — Score History (localStorage)
// ============================================================

const HISTORY_KEY = "breatheasy-history-v1";
const MAX_SNAPSHOTS = 50;
const MAX_ROUTES = 20;

export interface ScoreSnapshot {
  timestamp: string;
  overall: number;
}

type HistoryData = Record<string, ScoreSnapshot[]>;

function loadHistory(): HistoryData {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as HistoryData;
  } catch {
    return {};
  }
}

function persistHistory(data: HistoryData) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  } catch { /* storage full */ }
}

export function saveSnapshot(routeId: string, overall: number): void {
  const data = loadHistory();
  const entry: ScoreSnapshot = { timestamp: new Date().toISOString(), overall };

  if (!data[routeId]) data[routeId] = [];
  data[routeId].push(entry);
  if (data[routeId].length > MAX_SNAPSHOTS) {
    data[routeId] = data[routeId].slice(-MAX_SNAPSHOTS);
  }

  // Enforce max routes (keep most recently updated)
  const keys = Object.keys(data);
  if (keys.length > MAX_ROUTES) {
    const sorted = keys.sort((a, b) => {
      const aLast = data[a][data[a].length - 1]?.timestamp ?? "";
      const bLast = data[b][data[b].length - 1]?.timestamp ?? "";
      return bLast.localeCompare(aLast);
    });
    for (const key of sorted.slice(MAX_ROUTES)) delete data[key];
  }

  persistHistory(data);
}

export function getHistory(routeId: string): ScoreSnapshot[] {
  const data = loadHistory();
  return data[routeId] ?? [];
}
