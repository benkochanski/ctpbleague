import { useState } from "react";
import type { Coach } from "../types";
import { COACHES } from "../config/coaches";

interface AuthPageProps {
  onLogin: (coach: Coach) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const coach = COACHES.find((c) => c.pin === pin);
    if (coach) {
      onLogin(coach);
    } else {
      setError("Invalid PIN");
      setPin("");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="bg-white p-10 rounded-lg shadow-2xl w-full max-w-md border-4 border-gray-900">
        <div className="text-center mb-8">
          <div className="text-5xl font-black italic tracking-tight mb-2">
            <span className="text-black">WHITE</span>
            <span className="text-gray-400"> SOX</span>
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">
            Team Manager
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-gray-700 mb-3">
              Coach PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError("");
              }}
              maxLength={4}
              placeholder="••••"
              className="w-full px-4 py-3 border-2 border-gray-900 rounded text-center text-3xl tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-500 font-mono"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 border-2 border-red-600 text-red-800 rounded font-semibold text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-black hover:bg-gray-800 text-white font-black uppercase tracking-widest py-3 rounded transition"
          >
            Enter Clubhouse
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Coaches Only
          </p>
        </div>
      </div>
    </div>
  );
}
