import type { Coach } from "../types";
import { DepthChart } from "./DepthChart";

interface CoachDashboardProps {
  coach: Coach;
  onLogout: () => void;
}

export function CoachDashboard({ coach, onLogout }: CoachDashboardProps) {
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
              Team Manager
            </div>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-white hover:bg-gray-200 text-black font-bold rounded transition uppercase text-sm tracking-wider"
          >
            Logout
          </button>
        </div>
      </div>
      <DepthChart
        coachId={coach.id}
        coachName={coach.name}
        isReadOnly={false}
      />
    </div>
  );
}
