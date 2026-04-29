import { useState, useEffect } from "react";
import type { DepthChart } from "../types";
import { ROSTER } from "../data/roster";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const USE_LOCAL_STORAGE = import.meta.env.DEV; // Use localStorage in dev, API in prod

function getStorageKey(coachId: string) {
  return `depthchart::${coachId}`;
}

// Alphabetized roster IDs (by first name, then last name). Used as the default
// hitter order for new charts and to append any roster players that are
// missing from an existing chart's hitter list.
function alphabetizedRosterIds(): string[] {
  return [...ROSTER]
    .sort((a, b) => {
      const byFirst = a.firstName.localeCompare(b.firstName);
      return byFirst !== 0 ? byFirst : a.lastName.localeCompare(b.lastName);
    })
    .map((p) => p.id);
}

export function useDepthChart(coachId: string) {
  const [chart, setChart] = useState<DepthChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const migrate = (data: any): DepthChart => {
    // Hitters: flatten old bucket structure to a single ordered array, then
    // append any roster players not yet ranked (alphabetically).
    let hitters: string[];
    if (Array.isArray(data.hitters)) {
      hitters = data.hitters.filter((id: unknown) => typeof id === "string");
    } else if (data.hitters && typeof data.hitters === "object") {
      hitters = [
        ...(data.hitters["++"] || []),
        ...(data.hitters["+"] || []),
        ...(data.hitters["-"] || []),
      ];
    } else {
      hitters = [];
    }
    const seen = new Set(hitters);
    for (const id of alphabetizedRosterIds()) {
      if (!seen.has(id)) hitters.push(id);
    }

    const pitchers = Array.isArray(data.pitchers) ? data.pitchers : [];
    const catchers = Array.isArray(data.catchers) ? data.catchers : [];

    const emptyDefense = { "1B": [], "2B": [], "SS": [], "3B": [] };
    const defense =
      data.defense && data.defense["1B"] !== undefined
        ? {
            "1B": data.defense["1B"] || [],
            "2B": data.defense["2B"] || [],
            "SS": data.defense["SS"] || [],
            "3B": data.defense["3B"] || [],
          }
        : emptyDefense;

    const notes =
      data.notes && typeof data.notes === "object"
        ? {
            hitting:
              data.notes.hitting ||
              [data.notes.hitters, data.notes.pitching]
                .filter((s: unknown) => typeof s === "string" && s)
                .join("\n\n") ||
              "",
            fielding:
              data.notes.fielding || data.notes.defense || "",
          }
        : { hitting: "", fielding: "" };

    return {
      ...data,
      hitters,
      pitchers,
      catchers,
      defense,
      notes,
    };
  };

  const loadChart = async () => {
    try {
      setLoading(true);
      setError(null);

      if (USE_LOCAL_STORAGE) {
        const stored = localStorage.getItem(getStorageKey(coachId));
        if (stored) {
          setChart(migrate(JSON.parse(stored)));
        } else {
          setChart(null);
        }
      } else {
        const response = await axios.get(`${API_BASE}/depthchart/${coachId}`);
        setChart(migrate(response.data));
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setChart(null);
      } else {
        setError("Failed to load depth chart");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChart();
  }, [coachId]);

  const saveChart = async (updatedChart: DepthChart): Promise<DepthChart | null> => {
    try {
      if (USE_LOCAL_STORAGE) {
        localStorage.setItem(
          getStorageKey(coachId),
          JSON.stringify(updatedChart)
        );
        setChart(updatedChart);
        return updatedChart;
      } else {
        const response = await axios.post(
          `${API_BASE}/depthchart/${coachId}`,
          updatedChart
        );
        setChart(response.data);
        return response.data;
      }
    } catch {
      setError("Failed to save depth chart");
      return null;
    }
  };

  const initializeChart = async (coachName: string) => {
    const newChart: DepthChart = {
      coachId,
      coachName,
      hitters: alphabetizedRosterIds(),
      pitchers: [],
      catchers: [],
      defense: { "1B": [], "2B": [], "SS": [], "3B": [] },
      notes: { hitting: "", fielding: "" },
      updatedAt: Date.now(),
    };

    return saveChart(newChart);
  };

  return {
    chart,
    loading,
    error,
    saveChart,
    initializeChart,
  };
}
