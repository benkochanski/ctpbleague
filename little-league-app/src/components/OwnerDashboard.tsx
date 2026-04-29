import { useState } from "react";
import type { Coach } from "../types";
import { COACHES } from "../config/coaches";
import { DepthChart } from "./DepthChart";
import { exportAllChartsCsv } from "../utils/exportCsv";

interface OwnerDashboardProps {
  coach: Coach;
  onLogout: () => void;
}

export function OwnerDashboard({ coach, onLogout }: OwnerDashboardProps) {
  const [selectedCoachId, setSelectedCoachId] = useState<string>(coach.id);
  const [isExporting, setIsExporting] = useState(false);
  const selectedCoach = COACHES.find((c) => c.id === selectedCoachId);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportAllChartsCsv();
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export CSV. Check the console for details.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-black text-white border-b-4 border-gray-300 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black italic tracking-tight">
              <span className="text-white">WHITE</span>
              <span className="text-gray-400"> SOX</span>
            </div>
            <div className="hidden sm:block h-8 w-px bg-gray-600"></div>
            <div className="hidden sm:block text-sm font-semibold uppercase tracking-widest text-gray-300">
              Team Manager <span className="text-yellow-400 ml-1">• Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-3 sm:px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold rounded transition uppercase text-xs sm:text-sm tracking-wider"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={onLogout}
              className="px-3 sm:px-4 py-2 bg-white hover:bg-gray-200 text-black font-bold rounded transition uppercase text-xs sm:text-sm tracking-wider"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border-b-2 border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-bold mr-2">
              Coach:
            </span>
            {COACHES.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCoachId(c.id)}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition ${
                  selectedCoachId === c.id
                    ? "bg-white text-black"
                    : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                {c.name}
                {c.id === coach.id && (
                  <span className="ml-1 text-xs opacity-70">(you)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedCoach && (
        <DepthChart
          key={selectedCoach.id}
          coachId={selectedCoach.id}
          coachName={selectedCoach.name}
          isReadOnly={selectedCoach.id !== coach.id}
        />
      )}
    </div>
  );
}
