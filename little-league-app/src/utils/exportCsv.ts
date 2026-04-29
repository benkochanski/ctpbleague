import axios from "axios";
import type { DepthChart, DefensePosition, Player } from "../types";
import { ROSTER } from "../data/roster";
import { COACHES } from "../config/coaches";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const USE_LOCAL_STORAGE = import.meta.env.DEV;

const DEFENSE_POSITIONS: DefensePosition[] = ["1B", "2B", "SS", "3B"];

function storageKey(coachId: string) {
  return `depthchart::${coachId}`;
}

async function fetchChart(coachId: string): Promise<DepthChart | null> {
  try {
    if (USE_LOCAL_STORAGE) {
      const raw = localStorage.getItem(storageKey(coachId));
      return raw ? (JSON.parse(raw) as DepthChart) : null;
    }
    const res = await axios.get<DepthChart>(
      `${API_BASE}/depthchart/${coachId}`
    );
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    console.error(`Failed to load chart for ${coachId}`, err);
    return null;
  }
}

function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

// RFC 4180-style CSV escaping: wrap in quotes if the cell contains a comma,
// quote, or newline; double any embedded quotes.
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildRows(
  coachName: string,
  chart: DepthChart,
  playerMap: Map<string, Player>
): string[][] {
  const rows: string[][] = [];

  const emit = (category: string, ids: string[]) => {
    for (const id of ids) {
      const p = playerMap.get(id);
      if (!p) continue;
      rows.push([coachName, category, playerName(p)]);
    }
  };

  emit("Hitting", chart.hitters || []);
  emit("Pitching", chart.pitchers || []);
  emit("Catching", chart.catchers || []);
  for (const pos of DEFENSE_POSITIONS) {
    emit(pos, chart.defense?.[pos] || []);
  }

  return rows;
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAllChartsCsv(): Promise<void> {
  const playerMap = new Map(ROSTER.map((p) => [p.id, p]));

  const results = await Promise.all(
    COACHES.map(async (c) => {
      const chart = await fetchChart(c.id);
      return { coach: c, chart };
    })
  );

  const allRows: string[][] = [["Coach", "Category", "Player"]];
  for (const { coach, chart } of results) {
    if (!chart) continue;
    allRows.push(...buildRows(coach.name, chart, playerMap));
  }

  const csv = allRows.map((row) => row.map(csvCell).join(",")).join("\n");

  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  triggerDownload(`depth-charts-${stamp}.csv`, csv);
}
