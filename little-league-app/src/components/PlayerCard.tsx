import type { Player } from "../types";

interface PlayerCardProps {
  player: Player;
  isDragging?: boolean;
}

export function PlayerCard({ player, isDragging }: PlayerCardProps) {
  return (
    <div
      className={`p-3 bg-white border-2 border-gray-300 rounded-lg cursor-move hover:shadow-md transition ${
        isDragging ? "opacity-50 bg-gray-100" : ""
      }`}
    >
      <div className="text-sm font-bold text-gray-800">
        #{player.jersey} {player.firstName} {player.lastName}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {player.parentFirstName} {player.parentLastName}
      </div>
    </div>
  );
}
