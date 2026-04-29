import { useEffect, useState } from "react";
import type {
  Player,
  DepthChart as DepthChartType,
  DefensePosition,
} from "../types";
import { ROSTER } from "../data/roster";
import { useDepthChart } from "../hooks/useDepthChart";

interface DepthChartProps {
  coachId: string;
  coachName: string;
  isReadOnly?: boolean;
}

type Category = "hitting" | "fielding";

type BoxId =
  | { kind: "hitters" }
  | { kind: "pitchers" }
  | { kind: "catchers" }
  | { kind: "defense"; position: DefensePosition };

const DEFENSE_POSITIONS: DefensePosition[] = ["1B", "2B", "SS", "3B"];

function boxLabel(box: BoxId): string {
  if (box.kind === "hitters") return "Hitting";
  if (box.kind === "pitchers") return "Pitching";
  if (box.kind === "catchers") return "Catching";
  return box.position;
}

function PlayerChip({
  player,
  number,
}: {
  player: Player;
  number?: number;
}) {
  return (
    <div className="inline-flex items-center h-8 px-3 bg-white border border-gray-800 rounded-full text-sm font-semibold text-gray-900 whitespace-nowrap w-fit flex-none">
      {number !== undefined && (
        <span className="mr-2 text-xs font-black text-gray-500">
          {number}.
        </span>
      )}
      {player.firstName} {player.lastName}
    </div>
  );
}

function Box({
  label,
  playerIds,
  players,
  ordered,
  editable,
  onTap,
}: {
  label: string;
  playerIds: string[];
  players: Map<string, Player>;
  ordered?: boolean;
  editable: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={editable ? onTap : undefined}
      disabled={!editable}
      className={`w-full min-h-[180px] p-4 border-2 border-gray-800 rounded-lg bg-white text-left transition ${
        editable
          ? "active:bg-gray-50 cursor-pointer hover:border-black"
          : "cursor-default"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-black text-gray-900">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-gray-500">
            {playerIds.length}
          </span>
          {editable && (
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 border border-gray-400 rounded px-2 py-0.5">
              Edit
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        {playerIds.map((playerId, index) => {
          const player = players.get(playerId);
          if (!player) return null;
          return (
            <PlayerChip
              key={playerId}
              player={player}
              number={ordered ? index + 1 : undefined}
            />
          );
        })}
        {playerIds.length === 0 && (
          <div className="w-full text-center text-gray-400 py-6 text-sm italic">
            {editable ? "Tap to add players" : "No players"}
          </div>
        )}
      </div>
    </button>
  );
}

function BoxEditor({
  title,
  initialIds,
  ordered,
  reorderOnly,
  players,
  onSave,
  onClose,
}: {
  title: string;
  initialIds: string[];
  ordered: boolean;
  reorderOnly?: boolean;
  players: Map<string, Player>;
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [ids, setIds] = useState<string[]>(initialIds);

  useEffect(() => {
    // Lock body scroll while sheet is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggle = (playerId: string) => {
    setIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const moveUp = (playerId: string) => {
    setIds((prev) => {
      const i = prev.indexOf(playerId);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (playerId: string) => {
    setIds((prev) => {
      const i = prev.indexOf(playerId);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const handleDone = () => {
    onSave(ids);
    onClose();
  };

  const selectedInOrder = ids
    .map((id) => players.get(id))
    .filter((p): p is Player => !!p);
  const selectedSet = new Set(ids);
  const unselected = ROSTER.filter((p) => !selectedSet.has(p.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={handleDone}
            className="px-4 py-2 bg-black text-white font-black uppercase tracking-wider text-sm rounded-lg active:bg-gray-800"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
          {ordered ? (
            <>
              {selectedInOrder.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs font-black uppercase tracking-wider text-gray-500 mb-3">
                    In This Box — Tap arrows to reorder
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedInOrder.map((player, i) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 border-2 border-gray-900 rounded-lg"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-black text-sm">
                          {i + 1}
                        </div>
                        <div className="flex-1 font-semibold text-gray-900 text-sm">
                          {player.firstName} {player.lastName}
                        </div>
                        <button
                          type="button"
                          onClick={() => moveUp(player.id)}
                          disabled={i === 0}
                          aria-label="Move up"
                          className="w-10 h-10 flex items-center justify-center text-xl disabled:opacity-30 active:bg-gray-200 rounded"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(player.id)}
                          disabled={i === selectedInOrder.length - 1}
                          aria-label="Move down"
                          className="w-10 h-10 flex items-center justify-center text-xl disabled:opacity-30 active:bg-gray-200 rounded"
                        >
                          ↓
                        </button>
                        {!reorderOnly && (
                          <button
                            type="button"
                            onClick={() => toggle(player.id)}
                            aria-label="Remove"
                            className="w-10 h-10 flex items-center justify-center text-2xl text-red-600 font-black active:bg-red-50 rounded"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!reorderOnly && unselected.length > 0 && (
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-gray-500 mb-3">
                    Add Player
                  </div>
                  <div className="flex flex-col gap-2">
                    {unselected.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => toggle(player.id)}
                        className="flex items-center gap-3 p-3 border-2 border-gray-300 rounded-lg text-left active:bg-gray-50"
                      >
                        <div className="flex-shrink-0 w-7 h-7 border-2 border-gray-400 rounded-full flex items-center justify-center text-gray-400 font-black">
                          +
                        </div>
                        <div className="flex-1 font-semibold text-gray-900">
                          {player.firstName} {player.lastName}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedInOrder.length === 0 && unselected.length === 0 && (
                <div className="text-center text-gray-400 py-12 italic">
                  No players available
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {ROSTER.map((player) => {
                const active = selectedSet.has(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => toggle(player.id)}
                    className={`flex items-center gap-3 p-3 border-2 rounded-lg text-left transition ${
                      active
                        ? "bg-black text-white border-black"
                        : "bg-white border-gray-300 active:bg-gray-50"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-7 h-7 rounded border-2 flex items-center justify-center font-black ${
                        active
                          ? "bg-white border-white text-black"
                          : "border-gray-400 text-transparent"
                      }`}
                    >
                      ✓
                    </div>
                    <div className="flex-1 font-semibold">
                      {player.firstName} {player.lastName}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t-2 border-gray-200 sm:hidden">
          <button
            type="button"
            onClick={handleDone}
            className="w-full py-3 bg-black text-white font-black uppercase tracking-wider text-sm rounded-lg active:bg-gray-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function DepthChart({
  coachId,
  coachName,
  isReadOnly = false,
}: DepthChartProps) {
  const { chart, loading, initializeChart, saveChart } =
    useDepthChart(coachId);
  const [category, setCategory] = useState<Category>("hitting");
  const [playerMap] = useState<Map<string, Player>>(
    new Map(ROSTER.map((p) => [p.id, p]))
  );
  const [localChart, setLocalChart] = useState<DepthChartType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingBox, setEditingBox] = useState<BoxId | null>(null);

  useEffect(() => {
    if (!loading && chart) {
      setLocalChart(chart);
    } else if (!loading && !chart) {
      initializeChart(coachName).then((result) => {
        if (result) setLocalChart(result);
      });
    }
  }, [loading, chart, coachName]);

  const getBoxIds = (box: BoxId): string[] => {
    if (!localChart) return [];
    if (box.kind === "hitters") return localChart.hitters;
    if (box.kind === "pitchers") return localChart.pitchers;
    if (box.kind === "catchers") return localChart.catchers;
    return localChart.defense[box.position];
  };

  const saveBox = async (box: BoxId, newIds: string[]) => {
    if (!localChart || isReadOnly) return;
    let updated: DepthChartType = { ...localChart, updatedAt: Date.now() };
    if (box.kind === "hitters") {
      updated.hitters = newIds;
    } else if (box.kind === "pitchers") {
      updated.pitchers = newIds;
    } else if (box.kind === "catchers") {
      updated.catchers = newIds;
    } else if (box.kind === "defense") {
      updated.defense = { ...updated.defense, [box.position]: newIds };
    }
    setLocalChart(updated);
    setIsSaving(true);
    await saveChart(updated);
    setIsSaving(false);
  };

  const handleNotesChange = (value: string) => {
    if (!localChart || isReadOnly) return;
    setLocalChart({
      ...localChart,
      notes: { ...localChart.notes, [category]: value },
    });
  };

  const handleNotesBlur = async () => {
    if (!localChart || isReadOnly) return;
    const updated = { ...localChart, updatedAt: Date.now() };
    setIsSaving(true);
    await saveChart(updated);
    setIsSaving(false);
  };

  const handleClearAll = async () => {
    if (!localChart || isReadOnly) return;

    let updated: DepthChartType;
    if (category === "fielding") {
      updated = {
        ...localChart,
        defense: { "1B": [], "2B": [], "SS": [], "3B": [] },
        updatedAt: Date.now(),
      };
    } else {
      // For hitting tab: reset hitters to alphabetical order and clear pitchers/catchers.
      const alphabetical = [...ROSTER]
        .sort((a, b) => {
          const byFirst = a.firstName.localeCompare(b.firstName);
          return byFirst !== 0 ? byFirst : a.lastName.localeCompare(b.lastName);
        })
        .map((p) => p.id);
      updated = {
        ...localChart,
        hitters: alphabetical,
        pitchers: [],
        catchers: [],
        updatedAt: Date.now(),
      };
    }

    setLocalChart(updated);
    setIsSaving(true);
    await saveChart(updated);
    setIsSaving(false);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!localChart) {
    return <div className="p-8 text-center">Failed to load depth chart</div>;
  }

  const boxesForCategory: BoxId[] =
    category === "hitting"
      ? [{ kind: "hitters" }, { kind: "pitchers" }, { kind: "catchers" }]
      : DEFENSE_POSITIONS.map((p) => ({ kind: "defense", position: p }));

  const gridClass =
    category === "hitting"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4";

  return (
    <div className="p-4 sm:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {(isReadOnly || isSaving) && (
          <div className="flex items-center gap-3 mb-4">
            {isReadOnly && (
              <span className="text-sm font-normal text-gray-500 italic">
                View Only
              </span>
            )}
            {isSaving && (
              <span className="text-xs text-gray-500">Saving...</span>
            )}
          </div>
        )}

        <div className="mb-4 flex gap-2 items-center flex-wrap">
          {(
            [
              { key: "hitting", label: "Hitting / Pitching / Catching" },
              { key: "fielding", label: "Fielding" },
            ] as const
          ).map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-black uppercase tracking-wider text-xs sm:text-sm transition ${
                category === cat.key
                  ? "bg-black text-white"
                  : "bg-white text-gray-700 border-2 border-gray-300 active:border-gray-900"
              }`}
            >
              {cat.label}
            </button>
          ))}
          {!isReadOnly && (
            <button
              onClick={handleClearAll}
              className="ml-auto px-3 sm:px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs sm:text-sm bg-red-600 active:bg-red-700 text-white transition"
            >
              Clear
            </button>
          )}
        </div>

        <div className={gridClass}>
          {boxesForCategory.map((box, idx) => (
            <Box
              key={idx}
              label={boxLabel(box)}
              playerIds={getBoxIds(box)}
              players={playerMap}
              ordered
              editable={!isReadOnly}
              onTap={() => setEditingBox(box)}
            />
          ))}
        </div>

        <div className="mt-6 bg-white border-2 border-gray-300 rounded-lg p-4">
          <label className="block text-sm font-black uppercase tracking-wider text-gray-700 mb-3">
            {category === "hitting" ? "Hitting Notes" : "Fielding Notes"}
          </label>
          <textarea
            value={localChart.notes[category]}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={handleNotesBlur}
            disabled={isReadOnly}
            placeholder={
              isReadOnly ? "No notes" : "Add notes for this category..."
            }
            rows={5}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed resize-y"
          />
        </div>
      </div>

      {editingBox && (
        <BoxEditor
          title={boxLabel(editingBox)}
          initialIds={getBoxIds(editingBox)}
          ordered
          reorderOnly={editingBox.kind === "hitters"}
          players={playerMap}
          onSave={(ids) => saveBox(editingBox, ids)}
          onClose={() => setEditingBox(null)}
        />
      )}
    </div>
  );
}
