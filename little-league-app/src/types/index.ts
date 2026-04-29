export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  city: string;
  jersey: number;
  parentEmail: string;
  parentPhone: string;
  parentFirstName: string;
  parentLastName: string;
}

export type DefensePosition = "1B" | "2B" | "SS" | "3B";

export type DefenseLists = Record<DefensePosition, string[]>;

export interface CategoryNotes {
  hitting: string;
  fielding: string;
}

export interface DepthChart {
  coachId: string;
  coachName: string;
  hitters: string[];
  pitchers: string[];
  catchers: string[];
  defense: DefenseLists;
  notes: CategoryNotes;
  updatedAt: number;
}

export interface Coach {
  id: string;
  name: string;
  pin: string;
  isOwner?: boolean;
}

export interface AuthContext {
  coach: Coach | null;
  setCoach: (coach: Coach | null) => void;
  isOwner: boolean;
}
