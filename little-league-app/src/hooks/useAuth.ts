import { useEffect, useState } from "react";
import type { Coach } from "../types";
import { COACHES } from "../config/coaches";

const STORAGE_KEY = "league_coach";

export function useAuth() {
  const [coach, setCoachState] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCoachState(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const setCoach = (newCoach: Coach | null) => {
    if (newCoach) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCoach));
      setCoachState(newCoach);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setCoachState(null);
    }
  };

  const login = (pin: string) => {
    const found = COACHES.find((c) => c.pin === pin);
    if (found) {
      setCoach(found);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCoach(null);
  };

  return {
    coach,
    setCoach,
    loading,
    login,
    logout,
    isOwner: coach?.isOwner ?? false,
  };
}
